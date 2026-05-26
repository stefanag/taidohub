import { Module } from '@nestjs/common';

import { BeltRanksController } from './belt-ranks.controller.js';
import { BeltRanksRepository } from './belt-ranks.repository.js';
import { BeltRanksService } from './belt-ranks.service.js';
import { BeltSystemsController } from './belt-systems.controller.js';
import { BeltSystemsRepository } from './belt-systems.repository.js';
import { BeltSystemsService } from './belt-systems.service.js';
import { PublicBeltRanksController } from './public-belt-ranks.controller.js';
import { ShogoTitlesController } from './shogo-titles.controller.js';
import { ShogoTitlesRepository } from './shogo-titles.repository.js';
import { ShogoTitlesService } from './shogo-titles.service.js';

@Module({
  providers: [
    BeltSystemsRepository,
    BeltSystemsService,
    BeltRanksRepository,
    BeltRanksService,
    ShogoTitlesRepository,
    ShogoTitlesService,
  ],
  exports: [
    BeltSystemsRepository,
    BeltSystemsService,
    BeltRanksRepository,
    BeltRanksService,
    ShogoTitlesRepository,
    ShogoTitlesService,
  ],
  controllers: [BeltSystemsController, BeltRanksController, ShogoTitlesController, PublicBeltRanksController],
})
export class BeltCatalogModule {}
