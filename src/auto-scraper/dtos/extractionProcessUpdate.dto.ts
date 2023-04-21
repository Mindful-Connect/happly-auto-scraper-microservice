export class ExtractionProcessUpdateDto {
  // The progress that was added to the extraction process (0-100)
  addedProgress = 0;

  isQueued = false;

  isFinished = false;

  isFailed = false;

  url: string;

  detail?: string;

  constructor(url: string, addedProgress?: number, finishedSuccessfully?: boolean) {
    this.url = url;
    this.addedProgress = addedProgress ?? 0;

    if (finishedSuccessfully !== undefined) {
      this.isFinished = true;
      if (!finishedSuccessfully) {
        this.isFailed = true;
      }
    }
  }

  queued() {
    this.isQueued = true;
    return this;
  }

  unqueued() {
    this.isQueued = false;
    return this;
  }

  finishedSuccessfully() {
    this.isFinished = true;
    return this;
  }

  finishedUnsuccessfully() {
    this.isFinished = true;
    this.isFailed = true;
    return this;
  }

  addDetail(detail: string) {
    this.detail = detail;
    return this;
  }
}
