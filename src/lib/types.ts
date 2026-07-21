export type EntityType =
  | "root"
  | "thesis"
  | "bet"
  | "task"
  | "person"
  | "interaction";

export type Entity = {
  id: string;
  type: EntityType;
  title: string;
  /** Freeform notes / body text */
  notes?: string;
  /** Person metadata */
  role?: string;
  firm?: string;
  /** Task metadata */
  status?: "todo" | "doing" | "done";
  /** Interaction metadata */
  date?: string;
};

export type Store = {
  entities: Record<string, Entity>;
  /** Ordered children for tree-owned relations (not bet↔person links) */
  children: Record<string, string[]>;
  /** Bet → person ids (many-to-many; person can appear under multiple bets) */
  betPeople: Record<string, string[]>;
};

export const ROOT_ID = "root";

export const TYPE_LABELS: Record<EntityType, string> = {
  root: "Workspace",
  thesis: "Thesis",
  bet: "Bet",
  task: "Task",
  person: "Person",
  interaction: "Interaction",
};

/** What child types can be created under a given focus type */
export function creatableChildTypes(type: EntityType): EntityType[] {
  switch (type) {
    case "root":
      return ["thesis"];
    case "thesis":
      return ["bet"];
    case "bet":
      return ["task", "person"];
    case "person":
      return ["interaction"];
    default:
      return [];
  }
}

export function sectionLabelFor(type: EntityType): string {
  switch (type) {
    case "thesis":
      return "Theses";
    case "bet":
      return "Bets";
    case "task":
      return "Tasks";
    case "person":
      return "People";
    case "interaction":
      return "Interactions";
    default:
      return "Items";
  }
}
