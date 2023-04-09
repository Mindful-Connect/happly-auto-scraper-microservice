import { ExtractedOpportunityDocument } from '@/app/schemas/extractedOpportunity.schema';

export interface ExtractingOpportunitiesQueueItem {
  url: string;
  extractingOpportunityDocument: ExtractedOpportunityDocument;
  isNested: boolean;
}
