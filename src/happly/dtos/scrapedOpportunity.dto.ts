export class ScrapedOpportunityDto {
  source_id = '';
  name = '';

  program_site = '';
  app_link = '';

  provider = '';
  description = '';
  value = '';

  amount = '';

  open_date = '';
  deadlines = '';
  process_time = '';

  comp_req = '';
  project_eligibility = '';
  ineligibility = '';
  eligible_activities = '';
  eligibility_candidates = '';

  role_req = '';
  app_req = '';

  cash_up: '0' | '1' | null = null;

  company_size_min_req: number | string = '';
  company_size_max_req: number | string = '';

  revenue_min_req: string | null = null;
  revenue_max_req: string | null = null;

  grant_type = '';
  country = '';
  region = '';
  region_tags = '';
  candidate_req_tags = '';
  subcategories = '';
  subcategories_tags = '';
  industry = '';
  keywords = '';
  app_type = '';
  business_type_req = '';
  role_type_tags = '';
  role_length_tags = '';
  project_activities_tags = '';
  project_length_tags = '';
  insights = '';

  constructor(partial?: Partial<ScrapedOpportunityDto>) {
    Object.assign(this, partial);
  }
}
