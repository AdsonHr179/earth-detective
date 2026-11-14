export type VariableRecord = {
  id: string;
  name: string;
  unit: string;
  description: string;
  source: string;
};

export async function fetchVariables(): Promise<VariableRecord[]> {
  const response = await fetch('/api/v1/variables');
  if (!response.ok) {
    throw new Error('Unable to fetch variables');
  }
  return response.json();
}
