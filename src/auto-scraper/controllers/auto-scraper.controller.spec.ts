import { Test, TestingModule } from '@nestjs/testing';
import { AutoScraperController } from './auto-scraper.controller';
import { AutoScraperService } from '@/auto-scraper/services/auto-scraper.service';

describe('AutoScraperController', () => {
  let autoScraperController: AutoScraperController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AutoScraperController],
      providers: [AutoScraperService],
    }).compile();

    autoScraperController = app.get<AutoScraperController>(AutoScraperController);
  });

  describe('root', () => {
    it('should be defined', function () {
      expect(autoScraperController).toBeDefined();
    });

    it('should have the required endpoints', () => {
      expect(autoScraperController.submitURLs).toBeDefined();
      expect(autoScraperController.listenForUpdates).toBeDefined();
    });
  });
});
