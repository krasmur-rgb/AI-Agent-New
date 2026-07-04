export interface Sprint {
  id: number;
  title: string;
  goal: string;
  scope: string[];
}

export interface Plan {
  product: string;
  sprints: Sprint[];
}

export interface ContractReview {
  approved: boolean;
  comments: string[];
}

export interface Verdict {
  passed: boolean;
  total_criteria: number;
  passed_criteria: number;
  failed_criteria: { criterion: string; details: string }[];
}
