import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Patch,
  Put,
  Query,
} from '@nestjs/common';
import { ApiCookieAuth, ApiParam, ApiTags } from '@nestjs/swagger';
import {
  LegalLocaleSchema,
  type LegalDocument,
  type LegalLocale,
} from '@repo/contracts/legal-documents';
import { ZodValidationPipe } from 'nestjs-zod';

import { ErrorEnvelopeDto } from '../../common/dto/error-envelope.dto.js';
import { ApiEndpoint } from '../../common/swagger/api-endpoint.decorator.js';
import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';
import { CurrentUser } from '../../infrastructure/auth/current-user.decorator.js';

import {
  CreateLegalDocumentDto,
  CreateLegalDocumentVersionDto,
  LegalDocumentDto,
  ListLegalDocumentsQueryDto,
  SaveLegalTranslationDto,
  UpdateLegalDocumentVersionDto,
} from './dto/legal-documents.dto.js';
import { LegalDocumentsService } from './legal-documents.service.js';

/**
 * Editing and publishing terms of use and privacy notices. Every route checks
 * `manage LegalDocument` against the owning organisation inside the service,
 * where the row is known (sysadmin: everything; orgadmin: their organisations).
 */
@ApiTags('legal-documents')
@ApiCookieAuth('session')
@Controller('legal-documents')
export class LegalDocumentsController {
  constructor(private readonly service: LegalDocumentsService) {}

  @Get()
  @ApiEndpoint({
    summary: 'List the texts of the platform or an organisation, with published version and draft.',
    operationId: 'LegalDocumentsController_list',
    ok: LegalDocumentDto,
    errorType: ErrorEnvelopeDto,
  })
  list(
    @Query() query: ListLegalDocumentsQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<LegalDocument[]> {
    return this.service.listDocuments(query.owner, user);
  }

  @Post()
  @ApiEndpoint({
    summary: 'Create a text (terms or privacy) for the platform or an organisation.',
    operationId: 'LegalDocumentsController_create',
    ok: LegalDocumentDto,
    errorType: ErrorEnvelopeDto,
    errors: ['400', '401', '403', '404', '409'],
  })
  create(
    @Body() body: CreateLegalDocumentDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<LegalDocument> {
    return this.service.createDocument(body, user);
  }

  @Get(':id')
  @ApiEndpoint({
    summary: 'One text with its published version and draft.',
    operationId: 'LegalDocumentsController_get',
    ok: LegalDocumentDto,
    errorType: ErrorEnvelopeDto,
  })
  get(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<LegalDocument> {
    return this.service.getDocument(id, user);
  }

  @Post(':id/versions')
  @ApiEndpoint({
    summary: 'Start a new draft version, optionally copying the published translations for review.',
    operationId: 'LegalDocumentsController_createVersion',
    ok: LegalDocumentDto,
    errorType: ErrorEnvelopeDto,
    errors: ['400', '401', '403', '404', '409'],
  })
  createVersion(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: CreateLegalDocumentVersionDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<LegalDocument> {
    return this.service.createVersion(id, body, user);
  }

  @Patch('versions/:versionId')
  @ApiEndpoint({
    summary: 'Change a draft: binding language, re-acceptance flag, change summary.',
    operationId: 'LegalDocumentsController_updateVersion',
    ok: LegalDocumentDto,
    errorType: ErrorEnvelopeDto,
    errors: ['400', '401', '403', '404', '409'],
  })
  updateVersion(
    @Param('versionId', new ParseUUIDPipe()) versionId: string,
    @Body() body: UpdateLegalDocumentVersionDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<LegalDocument> {
    return this.service.updateVersion(versionId, body, user);
  }

  @Delete('versions/:versionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiEndpoint({
    summary: 'Delete a draft version.',
    operationId: 'LegalDocumentsController_deleteDraft',
    errorType: ErrorEnvelopeDto,
    errors: ['401', '403', '404', '409'],
  })
  deleteDraft(
    @Param('versionId', new ParseUUIDPipe()) versionId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    return this.service.deleteDraft(versionId, user);
  }

  @Put('versions/:versionId/translations/:locale')
  @ApiParam({ name: 'locale', enum: LegalLocaleSchema.options })
  @ApiEndpoint({
    summary:
      'Save one language. Replaces it on a draft; adds a revision on a published version, except for the legally binding language.',
    operationId: 'LegalDocumentsController_saveTranslation',
    ok: LegalDocumentDto,
    errorType: ErrorEnvelopeDto,
    errors: ['400', '401', '403', '404', '409'],
  })
  saveTranslation(
    @Param('versionId', new ParseUUIDPipe()) versionId: string,
    @Param('locale', new ZodValidationPipe(LegalLocaleSchema)) locale: LegalLocale,
    @Body() body: SaveLegalTranslationDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<LegalDocument> {
    return this.service.saveTranslation(versionId, locale, body, user);
  }

  @Delete('versions/:versionId/translations/:locale')
  @ApiParam({ name: 'locale', enum: LegalLocaleSchema.options })
  @ApiEndpoint({
    summary: 'Remove one language from a draft.',
    operationId: 'LegalDocumentsController_deleteTranslation',
    ok: LegalDocumentDto,
    errorType: ErrorEnvelopeDto,
    errors: ['400', '401', '403', '404', '409'],
  })
  deleteTranslation(
    @Param('versionId', new ParseUUIDPipe()) versionId: string,
    @Param('locale', new ZodValidationPipe(LegalLocaleSchema)) locale: LegalLocale,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<LegalDocument> {
    return this.service.deleteTranslation(versionId, locale, user);
  }

  @Post('versions/:versionId/publish')
  @HttpCode(HttpStatus.OK)
  @ApiEndpoint({
    summary: 'Publish a draft. The previous published version is retired.',
    operationId: 'LegalDocumentsController_publish',
    ok: LegalDocumentDto,
    errorType: ErrorEnvelopeDto,
    errors: ['401', '403', '404', '409'],
  })
  publish(
    @Param('versionId', new ParseUUIDPipe()) versionId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<LegalDocument> {
    return this.service.publish(versionId, user);
  }
}
