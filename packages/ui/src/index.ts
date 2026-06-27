import type { GraphNode } from "@studyagent/schemas";

export { cn } from "./lib/utils.js";
export { Button, type ButtonProps } from "./components/ui/button.js";
export { Badge, type BadgeProps } from "./components/ui/badge.js";
export { Card, CardHeader, CardTitle, CardDescription, CardContent } from "./components/ui/card.js";
export { Input } from "./components/ui/input.js";
export { Textarea } from "./components/ui/textarea.js";
export { Label } from "./components/ui/label.js";
export { Progress } from "./components/ui/progress.js";
export { Separator } from "./components/ui/separator.js";
export { Tabs, TabsList, TabsTrigger, TabsContent } from "./components/ui/tabs.js";
export {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "./components/ui/dialog.js";

export function getNodeDisplayLabel(node: GraphNode): string {
  return node.title;
}
