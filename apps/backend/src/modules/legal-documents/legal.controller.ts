import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { ErrorEnvelopeDto } from '../../common/dto/error-envelope.dto.js';
import { ApiEndpoint } from '../../common/swagger/api-endpoint.decorator.js';
import { Public } from '../../infrastructure/auth/public.decorator.js';

import {
  ApplicableLegalTextsDto,
  GetPublishedLegalDocumentQueryDto,
  InvitationLegalTextsQueryDto,
  PublishedLegalDocumentDto,
} from './dto/legal-documents.dto.js';
import { LegalDocumentsService } from './legal-documents.service.js';

import type { ApplicableLegalTexts, PublishedLegalDocument } from '@repo/contracts/legal-documents';

/**
 * Public read access to published texts: people must be able to read them
 * before they register or accept an invitation.
 */
@ApiTags('legal')
@Controller('legal')
export class LegalController {
  constructor(private readonly service: LegalDocumentsService) {}

  @Get('published')
  @Public()
  @ApiEndpoint({
    summary:
      'A published text in the requested language, or in the legally binding one if missing.',
    operationId: 'LegalController_published',
    ok: PublishedLegalDocumentDto,
    errorType: ErrorEnvelopeDto,
    errors: ['400', '404'],
  })
  published(@Query() query: GetPublishedLegalDocumentQueryDto): Promise<PublishedLegalDocument> {
    return this.service.getPublished(query);
  }

  @Get('invitation')
  @Public()
  @ApiEndpoint({
    summary:
      'The texts to accept on the set-password page of an invitation link. Empty for password resets.',
    operationId: 'LegalController_invitation',
    ok: ApplicableLegalTextsDto,
    errorType: ErrorEnvelopeDto,
    errors: ['400'],
  })
  invitation(@Query() query: InvitationLegalTextsQueryDto): Promise<ApplicableLegalTexts> {
    return this.service.applicableForInvitationToken(query.token, query.locale);
  }
}
