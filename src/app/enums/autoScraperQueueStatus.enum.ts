export enum AutoScraperQueueStatusEnum {
  PENDING = 'pending',
  FULLY_EXTRACTED = 'fully_extracted',
  PARTIALLY_EXTRACTED = 'partially_extracted',
  FAILED_TO_PROCESS = 'failed_to_process',
  GPT_ERROR = 'gpt_error',
}
