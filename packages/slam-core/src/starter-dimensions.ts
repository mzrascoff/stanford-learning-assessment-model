import type { AnchorExample, PromptStep, RubricDimension } from "./contracts.js";

export interface StarterDimensionLibrary {
  writing: RubricDimension[];
  coding: RubricDimension[];
  reflectiveReasoning: RubricDimension[];
}

export const starterDimensions: StarterDimensionLibrary = {
  writing: [
    {
      id: "writing-claim-evidence",
      label: "Claim and evidence",
      category: "cognitive",
      scale: { min: 1, max: 4, labels: ["emerging", "developing", "proficient", "advanced"] },
      criteria: [
        "States a defensible claim or thesis.",
        "Uses relevant evidence to support the main idea.",
        "Connects evidence back to the central argument."
      ],
      evidenceRequirements: ["At least one explicit claim", "Evidence from the provided material or task"]
    },
    {
      id: "writing-revision-awareness",
      label: "Revision awareness",
      category: "metacognitive",
      scale: { min: 1, max: 4, labels: ["emerging", "developing", "proficient", "advanced"] },
      criteria: [
        "Explains what is uncertain or incomplete.",
        "Identifies a concrete revision goal.",
        "Reflects on strategy choices."
      ],
      evidenceRequirements: ["A reflection on confidence or uncertainty", "A next-step revision plan"]
    }
  ],
  coding: [
    {
      id: "coding-problem-decomposition",
      label: "Problem decomposition",
      category: "cognitive",
      scale: { min: 1, max: 4, labels: ["emerging", "developing", "proficient", "advanced"] },
      criteria: [
        "Breaks the task into logical steps.",
        "Chooses a sensible algorithm or structure.",
        "Explains tradeoffs or assumptions."
      ],
      evidenceRequirements: ["Structured plan or pseudocode", "Reasoning about tradeoffs"]
    },
    {
      id: "coding-debug-reflection",
      label: "Debug reflection",
      category: "metacognitive",
      scale: { min: 1, max: 4, labels: ["emerging", "developing", "proficient", "advanced"] },
      criteria: [
        "Describes what was tested or checked.",
        "Explains a failure mode or uncertainty.",
        "Uses confidence or self-monitoring to guide next steps."
      ],
      evidenceRequirements: ["One debugging or validation note", "One confidence or self-monitoring statement"]
    }
  ],
  reflectiveReasoning: [
    {
      id: "reasoning-transfer",
      label: "Reasoning transfer",
      category: "cognitive",
      scale: { min: 1, max: 4, labels: ["emerging", "developing", "proficient", "advanced"] },
      criteria: [
        "Connects the current task to prior knowledge or examples.",
        "Uses an explicit reasoning chain.",
        "Adjusts the approach when new information appears."
      ],
      evidenceRequirements: ["Explicit reasoning language", "A comparison, analogy, or transfer example"]
    },
    {
      id: "reasoning-monitoring",
      label: "Reasoning monitoring",
      category: "metacognitive",
      scale: { min: 1, max: 4, labels: ["emerging", "developing", "proficient", "advanced"] },
      criteria: [
        "Tracks confidence across the task.",
        "Explains why confidence changes.",
        "Names a strategy for checking work."
      ],
      evidenceRequirements: ["Confidence update", "A verification or monitoring strategy"]
    }
  ]
};

export function getAllStarterDimensions(): RubricDimension[] {
  return Object.values(starterDimensions).flat();
}

export function buildStarterAnchors(dimensions: RubricDimension[]): AnchorExample[] {
  return dimensions.map((dimension, index) => ({
    id: `anchor-${index + 1}-${dimension.id}`,
    dimensionId: dimension.id,
    performanceLevel: dimension.scale.labels?.at(-1) ?? String(dimension.scale.max),
    excerpt: `This response demonstrates ${dimension.label.toLowerCase()} with explicit evidence and a clear explanation of strategy choices.`,
    rationale: `Use this as an anchor for strong evidence of ${dimension.label.toLowerCase()}.`
  }));
}

export function buildStarterPrompts(dimensions: RubricDimension[]): PromptStep[] {
  const cognitive = dimensions.filter((dimension) => dimension.category === "cognitive");
  const metacognitive = dimensions.filter((dimension) => dimension.category === "metacognitive");

  return [
    {
      id: "prompt-1",
      title: "Primary task",
      prompt: "Produce a first-pass response to the assignment. Make your reasoning explicit and show the steps you used.",
      responseType: "text",
      targetDimensionIds: cognitive.map((dimension) => dimension.id),
      guidance: "Use concrete evidence, examples, or intermediate reasoning rather than only a final answer."
    },
    {
      id: "prompt-2",
      title: "Confidence check",
      prompt: "Explain what you are most confident about, what remains uncertain, and how you would verify or improve your work.",
      responseType: "reflection",
      targetDimensionIds: metacognitive.map((dimension) => dimension.id),
      guidance: "Name at least one uncertainty and one strategy for checking your work."
    }
  ];
}
