import { Type } from "@mariozechner/pi-ai";
import { getToolContract } from "@studyagent/tools";

type JsonSchema = {
  type?: string | string[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  anyOf?: JsonSchema[];
  oneOf?: JsonSchema[];
  description?: string;
  default?: unknown;
  additionalProperties?: boolean | JsonSchema;
};

type JsonSchemaLike = JsonSchema & Record<string, unknown>;

type PiToolParameters = ReturnType<typeof Type.Object>;

export type PiToolMetadata = {
  name: string;
  label: string;
  description: string;
  parameters: PiToolParameters;
};

export function getPiToolParameters(toolName: string): PiToolParameters {
  const contract = getToolContract(toolName);
  if (!contract) {
    return Type.Object({}, { additionalProperties: true });
  }
  return zodSchemaToPiToolParameters(contract.inputSchema);
}

export function getPiToolMetadata(toolName: string): PiToolMetadata {
  const contract = getToolContract(toolName);
  if (!contract) {
    return {
      name: toolName,
      label: toolName,
      description: toolName,
      parameters: Type.Object({}, { additionalProperties: true }),
    };
  }

  return {
    name: contract.name,
    label: contract.name,
    description: contract.description,
    parameters: getPiToolParameters(toolName),
  };
}

/**
 * Unwraps z.preprocess schemas so Pi sees the actual inner schema instead of
 * an empty {} (which is what z.preprocess produces when .toJSONSchema() is called).
 */
function unwrapZodPreprocess(schema: { toJSONSchema?: () => unknown }): { toJSONSchema?: () => unknown } {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const def = (schema as any)._def;
  if (def && def.typeName === "ZodEffects" && def.effect?.type === "preprocess") {
    const inner = def.schema as { toJSONSchema?: () => unknown };
    return inner ?? schema;
  }
  return schema;
}

function zodSchemaToPiToolParameters(schema: { toJSONSchema?: () => unknown }): PiToolParameters {
  const unwrapped = unwrapZodPreprocess(schema);
  const jsonSchema = unwrapped.toJSONSchema?.();
  const piSchema = jsonSchemaToPiSchema(jsonSchema);
  if (!isJsonSchemaObject(piSchema) || piSchema.type !== "object") {
    return Type.Object({}, { additionalProperties: true });
  }
  return piSchema as unknown as PiToolParameters;
}

function jsonSchemaToPiSchema(schema: unknown): JsonSchemaLike {
  if (!isJsonSchemaObject(schema)) {
    return {};
  }

  const unionMember = firstConcreteUnionMember(schema);
  if (unionMember) {
    return jsonSchemaToPiSchema(unionMember);
  }

  const type = Array.isArray(schema.type)
    ? schema.type.find((candidate) => candidate !== "null")
    : schema.type;

  switch (type) {
    case "object":
      return jsonObjectSchemaToPiSchema(schema);
    case "array": {
      const itemsSchema = jsonSchemaToPiSchema(schema.items);
      // If items resolve to empty (e.g. from z.preprocess), allow any object
      const items = Object.keys(itemsSchema).length > 0 ? itemsSchema : { type: "object", additionalProperties: true };
      const result: JsonSchemaLike = {
        type: "array",
        items,
      };
      copyDescription(schema, result);
      return result;
    }
    case "string": {
      const result: JsonSchemaLike = { type: "string" };
      copyDescription(schema, result);
      return result;
    }
    case "integer":
    case "number": {
      const result: JsonSchemaLike = { type: "number" };
      copyDescription(schema, result);
      return result;
    }
    case "boolean": {
      const result: JsonSchemaLike = { type: "boolean" };
      copyDescription(schema, result);
      return result;
    }
    default:
      // If we have properties but no type, treat as object
      if (schema.properties) {
        return jsonObjectSchemaToPiSchema(schema);
      }
      return {};
  }
}

function jsonObjectSchemaToPiSchema(schema: JsonSchema): JsonSchemaLike {
  const properties: Record<string, JsonSchemaLike> = {};
  for (const [propertyName, propertySchema] of Object.entries(schema.properties ?? {})) {
    properties[propertyName] = jsonSchemaToPiSchema(propertySchema);
  }

  const required = (schema.required ?? []).filter((propertyName) => {
    const propertySchema = schema.properties?.[propertyName];
    return !isJsonSchemaObject(propertySchema) || !("default" in propertySchema);
  });

  const result: JsonSchemaLike = {
    type: "object",
    properties,
  };
  if (required.length > 0) {
    result.required = required;
  }
  if (schema.additionalProperties === true || isJsonSchemaObject(schema.additionalProperties)) {
    result.additionalProperties = true;
  }
  copyDescription(schema, result);
  return result;
}

function firstConcreteUnionMember(schema: JsonSchema): JsonSchema | undefined {
  const candidates = schema.anyOf ?? schema.oneOf;
  return candidates?.find((candidate) => {
    const type = Array.isArray(candidate.type) ? candidate.type : [candidate.type];
    return !type.includes("null");
  });
}

function copyDescription(source: JsonSchema, target: JsonSchemaLike): void {
  if (typeof source.description === "string" && source.description.length > 0) {
    target.description = source.description;
  }
}

function isJsonSchemaObject(value: unknown): value is JsonSchemaLike {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
