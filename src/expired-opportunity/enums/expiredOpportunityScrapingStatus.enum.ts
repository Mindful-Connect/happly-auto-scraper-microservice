export enum ExpiredOpportunityScrapingStatusEnum {
  Processing = 'Processing',
  Updated = 'Updated',
  Failed = 'Failed',
}

export const StatusToPriorityMap = {
  [ExpiredOpportunityScrapingStatusEnum.Updated]: 2,
  [ExpiredOpportunityScrapingStatusEnum.Failed]: 1,
  [ExpiredOpportunityScrapingStatusEnum.Processing]: 0,
};
