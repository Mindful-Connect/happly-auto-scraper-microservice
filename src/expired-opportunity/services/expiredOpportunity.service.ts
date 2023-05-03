import { Injectable, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ExpiredOpportunityRepository } from '@/expired-opportunity/expiredOpportunity.repository';
import { ExtractorForExpiredOpportunityService } from '@/expired-opportunity/services/extractorForExpiredOpportunity.service';
import { ExpiredOpportunity, ExpiredOpportunityDocument } from '@/expired-opportunity/expiredOpportunity.schema';
import { ModuleRef } from '@nestjs/core';
import { OpportunityPortalService } from '@/happly/services/opportunityPortal.service';
import { saveSafely } from '@/_domain/helpers/mongooseHelpers';

@Injectable()
export class ExpiredOpportunityService implements OnModuleInit {
  private readonly poolSize = 1; // TODO: for testing i put 1. it should be 10.
  private readonly pool: Array<Promise<[string[], number, ExpiredOpportunityDocument]> | null> = new Array(this.poolSize).fill(null);

  constructor(
    private readonly moduleRef: ModuleRef,
    private readonly expiredOpportunityRepository: ExpiredOpportunityRepository,
    private readonly opportunityPortalService: OpportunityPortalService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  private async syncExpiredOpportunities() {
    const lastCreatedExpiredOpportunity = await this.expiredOpportunityRepository.model.findOne().sort({ originalCreatedAt: -1 }).exec();
    let originalCreatedAt: string | null = null;
    if (lastCreatedExpiredOpportunity !== null) {
      originalCreatedAt = lastCreatedExpiredOpportunity.originalCreatedAt;
    }

    // fetch the every expired opportunity
    const incomingExpiredOpportunities = await this.opportunityPortalService.getExpiredOpportunities(originalCreatedAt);
    if (!Array.isArray(incomingExpiredOpportunities)) {
      return;
    }

    // save the expired opportunities to the database.
    // The Unique constraint on the `syncId` field will make sure that no duplicates are saved.
    incomingExpiredOpportunities.forEach(newExpOpp => {
      const c = new ExpiredOpportunity({
        syncId: newExpOpp.sync_id,
        url: newExpOpp.url_en || newExpOpp.url_fr,
        originalCreatedAt: newExpOpp.created_at,
      });
      c.application_deadline_date.data = newExpOpp.deadline;
      const newDoc = new this.expiredOpportunityRepository.model(c);
      newDoc.save().catch(e => {
        if (e.code === 11000) console.debug('Duplicates are not saved.', e);
        else console.error('Error saving the expired opportunity', e);
      });
    });
  }

  /**
   * This cron job is a safety measure to make sure that the scraping is always running and not stopped.
   * @private
   */
  @Cron(CronExpression.EVERY_10_MINUTES)
  private async makeSureScrapingIsRunning() {
    try {
      if (this.pool.every(extractor => extractor === null)) {
        await this.scrapeAll();
      }
    } catch (e) {
      console.error(e);
    }
  }

  async onModuleInit() {
    await this.syncExpiredOpportunities();

    // TODO: REMOVE THIS. THIS IS FOR TESTING ONLY
    this.makeSureScrapingIsRunning();
  }

  async scrapeAll() {
    // Fetch the first 10 (pool size) expired opportunities from the database that are not permanently closed and have not failed to fetch the page 3 times.
    // And sort them by the last scraped date. This is to make sure that the ones that have not been scraped for the longest time are scraped first.
    const expiredOpportunities = await this.expiredOpportunityRepository.model
      .find({
        isPermanentlyClosed: false,
        failedToFetchPageCount: { $lt: 3 },
      })
      .sort({ lastScrapedAt: 1, failedToFetchPageCount: 1 })
      .limit(this.poolSize)
      .exec();

    // Fill up the pool with the first 10 (pool size) expired opportunities
    for (let index = 0; index < expiredOpportunities.length; index++) {
      const expiredOpportunity = expiredOpportunities[index];
      this.pool[index] = new Promise(resolve => {
        this.moduleRef
          .resolve(ExtractorForExpiredOpportunityService)
          .then(service => {
            service.setExtractingOpportunityQueueItem({
              index: index,
              url: expiredOpportunity.url,
              doc: expiredOpportunity,
              isNested: false,
            });
            return service.extract();
          })
          .then(result => {
            resolve(result);
          })
          .catch(e => {
            console.error(e);
            saveSafely(expiredOpportunity);
            resolve([[], index, expiredOpportunity]);
          });
      });
    }

    // Keep scraping until there is no more expired opportunity in the database to scrape
    while (this.pool.some(extractor => extractor !== null)) {
      const [relevantLinks, index, doc] = await Promise.any(this.pool.filter(x => x !== null));

      // continue with the relevant links
      if (relevantLinks && Array.isArray(relevantLinks) && relevantLinks.length > 0) {
        // TODO: support multiple links
        const link = relevantLinks[0];
        const service = await this.moduleRef.resolve(ExtractorForExpiredOpportunityService);
        service.setExtractingOpportunityQueueItem({
          index: index,
          url: link,
          doc: doc,
          isNested: true,
        });

        this.pool[index] = new Promise(resolve => {
          service
            .extract()
            .then(() => {
              console.log('done with the relevant link ' + relevantLinks);
            })
            .catch(e => {
              console.error(e);
              saveSafely(doc);
            })
            .finally(() => {
              resolve([[], index, doc]);
            });
        });

        continue;
      }

      // At this point, the process is done, and we can safely remove and potentially replace this index of the pool with another expired opportunity.
      // This is done to make sure that the pool is always full and the scraping is always running.

      this.pool[index] = null;

      const anotherExpiredOpportunity = await this.expiredOpportunityRepository.model
        .findOne({
          isPermanentlyClosed: false,
          failedToFetchPageCount: { $lt: 3 },
        })
        .sort({ lastScrapedAt: 1, failedToFetchPageCount: 1 })
        .exec();
      if (!anotherExpiredOpportunity) {
        // There is no more expired opportunity to scrape. We can keep this index of the pool empty.
        continue;
      }

      const service = await this.moduleRef.resolve(ExtractorForExpiredOpportunityService);
      this.pool[index] = new Promise(resolve => {
        service.setExtractingOpportunityQueueItem({
          index: index,
          url: anotherExpiredOpportunity.url,
          doc: anotherExpiredOpportunity,
          isNested: false,
        });

        service
          .extract()
          .then(result => {
            resolve(result);
          })
          .catch(e => {
            console.error(e);
            saveSafely(doc);
            resolve([[], index, anotherExpiredOpportunity]);
          });
      });
    }
  }
}
