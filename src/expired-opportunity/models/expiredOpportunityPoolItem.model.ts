import { ExpiredOpportunityDocument } from '@/expired-opportunity/expiredOpportunity.schema';

export interface ExpiredOpportunityPoolItemModel {
  index: number;
  url: string;
  doc: ExpiredOpportunityDocument;
  isNested: boolean;
}
