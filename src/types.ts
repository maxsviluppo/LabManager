export interface Laboratory {
  id: number;
  name: string;
  description?: string;
  netProfit?: number;
}

export interface ArchiveMaterial {
  id: number;
  name: string;
  unit: string;
  quantity: number;
}

export interface Material {
  id: number;
  name: string;
  unit: string;
  total_quantity: number;
  used_quantity: number;
  unit_cost: number;
  location?: string;
  archive_id?: number;
}

export interface Income {
  id: number;
  description: string;
  amount: number;
  date: string;
}

export interface Expense {
  id: number;
  category: 'salary' | 'material_purchase' | 'other';
  description: string;
  amount: number;
  date: string;
  material_id?: number;
}

export interface Summary {
  totalIncome: number;
  totalExpenses: number;
  netProfit: number;
  breakdown: {
    materials: number;
    salaries: number;
    other: number;
  };
}
