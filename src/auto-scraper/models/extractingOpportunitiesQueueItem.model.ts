import { ExtractedOpportunityDocument } from '@/extracted-opportunity/schemas/extractedOpportunity.schema';

export interface ExtractingOpportunitiesQueueItem {
  url: string;
  extractingOpportunityDocument: ExtractedOpportunityDocument;
  isNested: boolean;
}
