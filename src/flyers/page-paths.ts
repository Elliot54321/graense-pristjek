/** Where newsletter page images live (shared by the import and /admin). */
export const PAGES_BUCKET = "newsletters";

export const pagePath = (issue: string, page: number) => `${issue}/p${String(page).padStart(2, "0")}.jpg`;
