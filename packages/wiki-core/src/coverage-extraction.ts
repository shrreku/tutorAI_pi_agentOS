/**
 * Coverage Item Extraction Module
 *
 * Extracts pedagogical coverage items from source material, claims, and structured content.
 * Supports all item families: definition, formula, notation, distinction, procedure, example, 
 * application, historical context, and misconception.
 */

export type CoverageItemFamily =
  | "definition"
  | "formula"
  | "notation"
  | "distinction"
  | "procedure"
  | "example"
  | "application"
  | "historical_context"
  | "misconception";

export type ExtractedCoverageItem = {
  id: string;
  notebookId: string;
  itemFamily: CoverageItemFamily;
  title: string;
  description: string | undefined;
  conceptId: string | undefined;
  claimId: string | undefined;
  sourceId: string | undefined;
  sourceVersionId: string | undefined;
  sourceRefsJson: unknown[];
  metadataJson: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
};

export type CoverageExtractionContext = {
  notebookId: string;
  sourceId: string;
  sourceVersionId: string;
  conceptId?: string;
  claimId?: string;
  chunkText: string;
  headingPath?: string[];
};

/**
 * Extracts definition items from concept definitions and formal descriptions.
 * Looks for patterns like "X is defined as", "X means", "the definition of X", etc.
 */
export function extractDefinitionItems(ctx: CoverageExtractionContext): ExtractedCoverageItem[] {
  const items: ExtractedCoverageItem[] = [];
  const definitionPatterns = [
    /^(\w+(?:\s+\w+)*)\s+(?:is\s+)?(?:defined\s+)?(?:as|=)\s+(.+?)(?:\.|$)/gim,
    /the\s+definition\s+(?:of\s+)?(\w+(?:\s+\w+)*)\s+(?:is|:)\s+(.+?)(?:\.|$)/gim,
    /(\w+(?:\s+\w+)*)\s+means\s+(.+?)(?:\.|$)/gim,
  ];

  for (const pattern of definitionPatterns) {
    let match;
    while ((match = pattern.exec(ctx.chunkText)) !== null) {
      items.push({
        id: `cov_${crypto.randomUUID().replaceAll("-", "")}`,
        notebookId: ctx.notebookId,
        itemFamily: "definition",
        title: match[1]?.trim() || "Definition",
        description: match[2]?.trim(),
        conceptId: ctx.conceptId,
        claimId: ctx.claimId,
        sourceId: ctx.sourceId,
        sourceVersionId: ctx.sourceVersionId,
        sourceRefsJson: [{ refType: "source", refId: ctx.sourceId }],
        metadataJson: {
          extractionMethod: "pattern_matching",
          confidence: 0.85,
          headingPath: ctx.headingPath,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
  }

  return items;
}

/**
 * Extracts formula items from mathematical expressions and equations.
 * Looks for LaTeX, symbolic notation, and labeled equations.
 */
export function extractFormulaItems(ctx: CoverageExtractionContext): ExtractedCoverageItem[] {
  const items: ExtractedCoverageItem[] = [];

  // Match LaTeX-style formulas
  const latexPattern = /\$\$(.+?)\$\$|\\left(.+?)\\right/g;
  let match;
  while ((match = latexPattern.exec(ctx.chunkText)) !== null) {
    const formula = match[1] || match[2];
    items.push({
      id: `cov_${crypto.randomUUID().replaceAll("-", "")}`,
      notebookId: ctx.notebookId,
      itemFamily: "formula",
      title: `Formula: ${formula?.substring(0, 50)}...`.substring(0, 100),
      description: formula,
      conceptId: ctx.conceptId,
      claimId: ctx.claimId,
      sourceId: ctx.sourceId,
      sourceVersionId: ctx.sourceVersionId,
      sourceRefsJson: [{ refType: "source", refId: ctx.sourceId }],
      metadataJson: {
        extractionMethod: "latex_detection",
        confidence: 0.9,
        formulaType: formula?.includes("=") ? "equation" : "expression",
        headingPath: ctx.headingPath,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  // Match numbered equations like "Equation 5: ..."
  const numberedEquationPattern = /(?:Equation|Formula|Eq\.|Eq)\s+(\d+)\s*:?\s*(.+?)(?=\n|$)/gi;
  while ((match = numberedEquationPattern.exec(ctx.chunkText)) !== null) {
    items.push({
      id: `cov_${crypto.randomUUID().replaceAll("-", "")}`,
      notebookId: ctx.notebookId,
      itemFamily: "formula",
      title: `Formula ${match[1]}: ${match[2]?.substring(0, 40)}...`.substring(0, 100),
      description: match[2]?.trim(),
      conceptId: ctx.conceptId,
      claimId: ctx.claimId,
      sourceId: ctx.sourceId,
      sourceVersionId: ctx.sourceVersionId,
      sourceRefsJson: [{ refType: "source", refId: ctx.sourceId }],
      metadataJson: {
        extractionMethod: "numbered_equation",
        confidence: 0.88,
        equationNumber: Number.parseInt(match[1] ?? "0", 10),
        headingPath: ctx.headingPath,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  return items;
}

/**
 * Extracts notation items from definitions of symbols and variables.
 * Looks for "let X be", "denote X by", "symbol X means", etc.
 */
export function extractNotationItems(ctx: CoverageExtractionContext): ExtractedCoverageItem[] {
  const items: ExtractedCoverageItem[] = [];
  const notationPatterns = [
    /(?:Let|Denote|Symbol)\s+([a-zαβγδλμνξπσφψω])\s+(?:be|denote|represent|mean)\s+(.+?)(?:\.|,)/gi,
    /\b([a-zαβγδλμνξπσφψω])\s*=\s*(.+?)\s+\((.+?)\)/gi,
  ];

  for (const pattern of notationPatterns) {
    let match;
    while ((match = pattern.exec(ctx.chunkText)) !== null) {
      items.push({
        id: `cov_${crypto.randomUUID().replaceAll("-", "")}`,
        notebookId: ctx.notebookId,
        itemFamily: "notation",
        title: `Notation: ${match[1]}`,
        description: match[2]?.trim() || match[3]?.trim(),
        conceptId: ctx.conceptId,
        claimId: ctx.claimId,
        sourceId: ctx.sourceId,
        sourceVersionId: ctx.sourceVersionId,
        sourceRefsJson: [{ refType: "source", refId: ctx.sourceId }],
        metadataJson: {
          extractionMethod: "notation_pattern",
          confidence: 0.82,
          symbol: match[1],
          headingPath: ctx.headingPath,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
  }

  return items;
}

/**
 * Extracts procedure items from step-by-step instructions and algorithms.
 * Looks for numbered steps, bullet points with "first", "next", "then", etc.
 */
export function extractProcedureItems(ctx: CoverageExtractionContext): ExtractedCoverageItem[] {
  const items: ExtractedCoverageItem[] = [];

  // Match numbered steps
  const stepsPattern = /^(\d+)\.\s+(.+?)(?=^\d+\.|$)/gim;
  let match;
  const steps: string[] = [];

  while ((match = stepsPattern.exec(ctx.chunkText)) !== null) {
    if (match[2]) {
      steps.push(match[2].trim());
    }
  }

  if (steps.length > 0) {
    const procedureText = steps.join("\n");
    if (ctx.headingPath?.some((h) => /procedure|algorithm|steps|how to/i.test(h)) || steps.length >= 3) {
      items.push({
        id: `cov_${crypto.randomUUID().replaceAll("-", "")}`,
        notebookId: ctx.notebookId,
        itemFamily: "procedure",
        title: `Procedure: ${ctx.headingPath?.[ctx.headingPath.length - 1] || "Step-by-step process"}`,
        description: procedureText,
        conceptId: ctx.conceptId,
        claimId: ctx.claimId,
        sourceId: ctx.sourceId,
        sourceVersionId: ctx.sourceVersionId,
        sourceRefsJson: [{ refType: "source", refId: ctx.sourceId }],
        metadataJson: {
          extractionMethod: "numbered_steps",
          confidence: 0.87,
          stepCount: steps.length,
          headingPath: ctx.headingPath,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
  }

  return items;
}

/**
 * Extracts misconception items from pedagogical warnings and common errors.
 * Looks for "common mistake", "misconception", "do not", "be careful", "warning", etc.
 */
export function extractMisconceptionItems(ctx: CoverageExtractionContext): ExtractedCoverageItem[] {
  const items: ExtractedCoverageItem[] = [];
  const misconceptionPatterns = [
    /(?:Common\s+)?(?:mistake|misconception|error|pitfall)\s*:?\s+(.+?)(?=\n|(?:Common|Mistake|Error))/gi,
    /⚠️\s+(?:Warning|Caution|Watch out)\s*:?\s+(.+?)(?=\n|⚠️)/gi,
    /(?:Do\s+not|Never)\s+(.+?)(?:instead|because)(.+?)(?=\n|$)/gi,
    /(?:A\s+common\s+)?misconception\s+(?:is\s+)?(?:that|is)\s+(.+?)(?=\.|but|however)/gi,
  ];

  for (const pattern of misconceptionPatterns) {
    let match;
    while ((match = pattern.exec(ctx.chunkText)) !== null) {
      items.push({
        id: `cov_${crypto.randomUUID().replaceAll("-", "")}`,
        notebookId: ctx.notebookId,
        itemFamily: "misconception",
        title: `Misconception: ${match[1]?.substring(0, 60)}...`.substring(0, 100),
        description: match[1]?.trim(),
        conceptId: ctx.conceptId,
        claimId: ctx.claimId,
        sourceId: ctx.sourceId,
        sourceVersionId: ctx.sourceVersionId,
        sourceRefsJson: [{ refType: "source", refId: ctx.sourceId }],
        metadataJson: {
          extractionMethod: "misconception_pattern",
          confidence: 0.84,
          correction: match[2]?.trim(),
          headingPath: ctx.headingPath,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
  }

  return items;
}

/**
 * Extracts distinction items comparing related concepts.
 * Looks for "difference between", "vs", "compare", "distinction", etc.
 */
export function extractDistinctionItems(ctx: CoverageExtractionContext): ExtractedCoverageItem[] {
  const items: ExtractedCoverageItem[] = [];
  const distinctionPatterns = [
    /(?:difference|distinction|contrast)\s+(?:between|among)\s+(.+?)\s+(?:and|is)/gi,
    /(.+?)\s+(?:vs|versus|compared to)\s+(.+?)(?=\n|$)/gi,
  ];

  for (const pattern of distinctionPatterns) {
    let match;
    while ((match = pattern.exec(ctx.chunkText)) !== null) {
      items.push({
        id: `cov_${crypto.randomUUID().replaceAll("-", "")}`,
        notebookId: ctx.notebookId,
        itemFamily: "distinction",
        title: `Distinction: ${match[1]?.substring(0, 50)} vs ${match[2]?.substring(0, 50)}`.substring(0, 100),
        description: `${match[1]} differs from ${match[2]}`,
        conceptId: ctx.conceptId,
        claimId: ctx.claimId,
        sourceId: ctx.sourceId,
        sourceVersionId: ctx.sourceVersionId,
        sourceRefsJson: [{ refType: "source", refId: ctx.sourceId }],
        metadataJson: {
          extractionMethod: "distinction_pattern",
          confidence: 0.8,
          concepts: [match[1]?.trim(), match[2]?.trim()],
          headingPath: ctx.headingPath,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
  }

  return items;
}

/**
 * Extracts example items from worked problems and concrete instantiations.
 * Looks for "example", "for instance", "such as", numbered examples, etc.
 */
export function extractExampleItems(ctx: CoverageExtractionContext): ExtractedCoverageItem[] {
  const items: ExtractedCoverageItem[] = [];
  const examplePatterns = [
    /(?:Example|For\s+(?:instance|example)|Illustration)\s*(?:\d+)?\s*:?\s+(.+?)(?=(?:Example|For\s+instance)|$)/gis,
    /(?:such\s+as|like|e\.g\.|e\.g,)\s+(.+?)(?=\n|[,;.])/gi,
  ];

  for (const pattern of examplePatterns) {
    let match;
    while ((match = pattern.exec(ctx.chunkText)) !== null) {
      items.push({
        id: `cov_${crypto.randomUUID().replaceAll("-", "")}`,
        notebookId: ctx.notebookId,
        itemFamily: "example",
        title: `Example: ${match[1]?.substring(0, 70)}...`.substring(0, 100),
        description: match[1]?.trim(),
        conceptId: ctx.conceptId,
        claimId: ctx.claimId,
        sourceId: ctx.sourceId,
        sourceVersionId: ctx.sourceVersionId,
        sourceRefsJson: [{ refType: "source", refId: ctx.sourceId }],
        metadataJson: {
          extractionMethod: "example_pattern",
          confidence: 0.83,
          headingPath: ctx.headingPath,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
  }

  return items;
}

/**
 * Extracts application items from real-world uses and practical applications.
 * Looks for "application", "used in", "applied to", "real-world", "practice", etc.
 */
export function extractApplicationItems(ctx: CoverageExtractionContext): ExtractedCoverageItem[] {
  const items: ExtractedCoverageItem[] = [];
  const applicationPatterns = [
    /(?:application|applied?|use|used)\s+(?:in|to)\s+(.+?)(?=\n|\.)/gi,
    /(?:real-?world|practical|practical\s+)?(?:application|use)\s+in\s+(.+?)(?=\n|\.)/gi,
    /this\s+(?:concept|technique|method)\s+(?:can\s+)?(?:be\s+)?(?:used|applied)\s+(?:to|in)\s+(.+?)(?=\n|\.)/gi,
  ];

  for (const pattern of applicationPatterns) {
    let match;
    while ((match = pattern.exec(ctx.chunkText)) !== null) {
      items.push({
        id: `cov_${crypto.randomUUID().replaceAll("-", "")}`,
        notebookId: ctx.notebookId,
        itemFamily: "application",
        title: `Application: ${match[1]?.substring(0, 70)}...`.substring(0, 100),
        description: match[1]?.trim(),
        conceptId: ctx.conceptId,
        claimId: ctx.claimId,
        sourceId: ctx.sourceId,
        sourceVersionId: ctx.sourceVersionId,
        sourceRefsJson: [{ refType: "source", refId: ctx.sourceId }],
        metadataJson: {
          extractionMethod: "application_pattern",
          confidence: 0.81,
          headingPath: ctx.headingPath,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
  }

  return items;
}

/**
 * Extracts historical context items.
 * Looks for "history", "named after", "discovered by", "attributed to", dates, etc.
 */
export function extractHistoricalContextItems(ctx: CoverageExtractionContext): ExtractedCoverageItem[] {
  const items: ExtractedCoverageItem[] = [];
  const historicalPatterns = [
    /(?:Named\s+)?after\s+(.+?)(?=,|who|\.)/gi,
    /(?:Discovered|Developed|Introduced)\s+(?:by|in)\s+(.+?)(?=\n|\.)/gi,
    /(?:history|historical\s+context)\s*:?\s+(.+?)(?=\n\n|^[A-Z])/gim,
    /\b(?:1[0-9]{3}|20[0-2][0-9])\b.+?(?:discovered|developed|introduced|proposed)\s+(.+?)(?=\n|\.)/gi,
  ];

  for (const pattern of historicalPatterns) {
    let match;
    while ((match = pattern.exec(ctx.chunkText)) !== null) {
      items.push({
        id: `cov_${crypto.randomUUID().replaceAll("-", "")}`,
        notebookId: ctx.notebookId,
        itemFamily: "historical_context",
        title: `Historical Context: ${match[1]?.substring(0, 70)}...`.substring(0, 100),
        description: match[1]?.trim(),
        conceptId: ctx.conceptId,
        claimId: ctx.claimId,
        sourceId: ctx.sourceId,
        sourceVersionId: ctx.sourceVersionId,
        sourceRefsJson: [{ refType: "source", refId: ctx.sourceId }],
        metadataJson: {
          extractionMethod: "historical_pattern",
          confidence: 0.78,
          headingPath: ctx.headingPath,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
  }

  return items;
}

/**
 * Main extraction function that combines all family-specific extractors.
 */
export function extractCoverageItems(ctx: CoverageExtractionContext): ExtractedCoverageItem[] {
  const allItems = [
    ...extractDefinitionItems(ctx),
    ...extractFormulaItems(ctx),
    ...extractNotationItems(ctx),
    ...extractProcedureItems(ctx),
    ...extractMisconceptionItems(ctx),
    ...extractDistinctionItems(ctx),
    ...extractExampleItems(ctx),
    ...extractApplicationItems(ctx),
    ...extractHistoricalContextItems(ctx),
  ];

  // Filter out low-confidence duplicates
  const deduplicated = new Map<string, ExtractedCoverageItem>();
  for (const item of allItems) {
    const key = `${item.itemFamily}:${item.title}`;
    const existing = deduplicated.get(key);
    if (!existing || (item.metadataJson.confidence as number) > (existing.metadataJson.confidence as number)) {
      deduplicated.set(key, item);
    }
  }

  return Array.from(deduplicated.values());
}

/**
 * Persists extracted coverage items to the database.
 */
export async function persistCoverageItems(
  items: ExtractedCoverageItem[],
  persist: (rows: Array<Record<string, unknown>>) => Promise<void>,
): Promise<string[]> {
  if (items.length === 0) return [];

  const ids = items.map((item) => item.id);

  try {
    await persist(
      items.map((item) => ({
        id: item.id,
        notebookId: item.notebookId,
        itemFamily: item.itemFamily,
        title: item.title,
        description: item.description || null,
        conceptId: item.conceptId || null,
        claimId: item.claimId || null,
        sourceId: item.sourceId || null,
        sourceVersionId: item.sourceVersionId || null,
        sourceRefsJson: item.sourceRefsJson,
        metadataJson: item.metadataJson,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      })),
    );
  } catch (error) {
    console.error("Error persisting coverage items:", error);
    throw error;
  }

  return ids;
}
