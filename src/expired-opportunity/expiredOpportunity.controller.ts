import { ExpiredOpportunityRepository } from '@/expired-opportunity/expiredOpportunity.repository';
import { Controller, Get, NotFoundException, Param, Query, UseGuards } from '@nestjs/common';
import { AuthTokenGuard } from '@/_domain/guards/authToken.guard';
import { ExpiredOpportunityResponseDto } from '@/expired-opportunity/dtos/expiredOpportunityResponse.dto';

@Controller('expired-opportunity')
@UseGuards(AuthTokenGuard)
export class ExpiredOpportunityController {
  constructor(private readonly expiredOpportunityRepository: ExpiredOpportunityRepository) {}

  @Get('/')
  async findAllPaginated(@Query('pageNumber') pageNumber: number) {
    const pageSize = 10;
    const items = await this.expiredOpportunityRepository.model
      .find()
      .sort({ priorityStatus: -1 })
      .skip((pageNumber - 1) * pageSize)
      .limit(pageSize)
      .exec();
    const totalCount = await this.expiredOpportunityRepository.model.count();
    return {
      items: items.map(
        i =>
          new ExpiredOpportunityResponseDto({
            syncId: i.syncId,
            url: i.url,
            deadline: i.application_deadline_date.data,
            status: i.status,
            isPermanentlyClosed: i.isPermanentlyClosed,
            lastScrapedAt: i.lastScrapedAt,
          }),
      ),
      totalCount,
      pageSize,
    };
  }

  @Get('/:syncId')
  async findOne(@Param('syncId') syncId: string) {
    const doc = await this.expiredOpportunityRepository.model.findOne({ syncId }).exec();
    if (!doc) throw new NotFoundException();
    return doc;
  }
}
