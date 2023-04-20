export enum QueueItemSourceEnum {
  HapplyApi = 'happly_api',
  Pocket = 'pocket', // Submitted by admin user via the Opportunity portal.
  ExpiredOpportunity = 'expired_opportunity', // An opportunity that has expired and is being re-scraped to see if it got updated.
}
