import { assertSupabaseClient } from '../config/supabase.js';

/** The five canonical rubric buckets every category must map to for scoring/blending. */
export const RUBRIC_CATEGORIES = ['delivery', 'codeQuality', 'cicd', 'teamHealth', 'blockers'] as const;
export type RubricCategory = (typeof RUBRIC_CATEGORIES)[number];

export interface SurveyCategoryRow {
  id: number;
  key: string;
  label: string;
  description: string | null;
  rubric_category: RubricCategory;
  is_builtin: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateCategoryInput {
  key: string;
  label: string;
  description?: string;
  rubricCategory: RubricCategory;
}

export interface UpdateCategoryInput {
  label?: string;
  description?: string;
  rubricCategory?: RubricCategory;
}

export async function listCategories(): Promise<SurveyCategoryRow[]> {
  const client = assertSupabaseClient();
  const { data, error } = await client.from('surveycategory').select('*').order('is_builtin', { ascending: false }).order('label');
  if (error) {
    throw new Error(`Failed to list survey categories: ${error.message}`);
  }
  return (data as SurveyCategoryRow[]) ?? [];
}

/** Just the category keys, used to constrain AI question generation. Falls back to the built-ins if the table is empty/unreachable. */
export async function listCategoryKeys(): Promise<string[]> {
  try {
    const categories = await listCategories();
    if (categories.length === 0) return [...RUBRIC_CATEGORIES];
    return categories.map((c) => c.key);
  } catch {
    return [...RUBRIC_CATEGORIES];
  }
}

/** Maps a category key to its rubric bucket (for scoring). Unknown keys map to themselves if already a rubric bucket, else null. */
export async function getRubricCategoryMap(): Promise<Map<string, RubricCategory>> {
  const categories = await listCategories();
  return new Map(categories.map((c) => [c.key, c.rubric_category]));
}

export async function getCategoryByKey(key: string): Promise<SurveyCategoryRow | null> {
  const client = assertSupabaseClient();
  const { data, error } = await client.from('surveycategory').select('*').eq('key', key).maybeSingle();
  if (error) {
    throw new Error(`Failed to load category ${key}: ${error.message}`);
  }
  return (data as SurveyCategoryRow) ?? null;
}

export async function createCategory(input: CreateCategoryInput): Promise<SurveyCategoryRow> {
  const client = assertSupabaseClient();
  const { data, error } = await client
    .from('surveycategory')
    .insert([
      {
        key: input.key,
        label: input.label,
        description: input.description ?? null,
        rubric_category: input.rubricCategory,
        is_builtin: false,
      },
    ])
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(`Failed to create category: ${error?.message ?? 'no row returned'}`);
  }
  return data as SurveyCategoryRow;
}

export async function updateCategory(id: number, input: UpdateCategoryInput): Promise<SurveyCategoryRow | null> {
  const client = assertSupabaseClient();
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.label !== undefined) patch.label = input.label;
  if (input.description !== undefined) patch.description = input.description;
  if (input.rubricCategory !== undefined) patch.rubric_category = input.rubricCategory;

  const { data, error } = await client.from('surveycategory').update(patch).eq('id', id).select('*').maybeSingle();
  if (error) {
    throw new Error(`Failed to update category ${id}: ${error.message}`);
  }
  return (data as SurveyCategoryRow) ?? null;
}

export async function getCategoryById(id: number): Promise<SurveyCategoryRow | null> {
  const client = assertSupabaseClient();
  const { data, error } = await client.from('surveycategory').select('*').eq('id', id).maybeSingle();
  if (error) {
    throw new Error(`Failed to load category ${id}: ${error.message}`);
  }
  return (data as SurveyCategoryRow) ?? null;
}

/** Number of survey questions currently tagged with this category key (blocks deletion of in-use categories). */
export async function countQuestionsUsingCategory(key: string): Promise<number> {
  const client = assertSupabaseClient();
  const { count, error } = await client
    .from('surveyquestion')
    .select('id', { count: 'exact', head: true })
    .eq('category', key);
  if (error) {
    throw new Error(`Failed to count questions for category ${key}: ${error.message}`);
  }
  return count ?? 0;
}

export async function deleteCategory(id: number): Promise<void> {
  const client = assertSupabaseClient();
  const { error } = await client.from('surveycategory').delete().eq('id', id);
  if (error) {
    throw new Error(`Failed to delete category ${id}: ${error.message}`);
  }
}
