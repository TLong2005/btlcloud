import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { JwtPayload } from '../auth/auth-user';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { DocumentUploadInterceptor } from './document-upload.interceptor';
import { DocumentsService } from './documents.service';
import { RenameDocumentDto } from './dto/rename-document.dto';

@Controller('documents')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Post()
  @Roles('ADMIN')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(DocumentUploadInterceptor)
  create(
    @CurrentUser() user: JwtPayload,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.documents.create(user.tenantId, file);
  }

  @Get()
  list(@CurrentUser() user: JwtPayload) {
    return this.documents.list(user.tenantId);
  }

  @Get(':id/file')
  async download(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    const file = await this.documents.download(user.tenantId, id);
    return new StreamableFile(file.body, {
      type: file.contentType,
      disposition: attachmentDisposition(file.filename),
      length: file.body.length,
    });
  }

  @Get(':id')
  get(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.documents.get(user.tenantId, id);
  }

  @Patch(':id')
  @Roles('ADMIN')
  rename(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: RenameDocumentDto,
  ) {
    return this.documents.rename(user.tenantId, id, body.filename);
  }

  @Put(':id/content')
  @Roles('ADMIN')
  @UseInterceptors(DocumentUploadInterceptor)
  replace(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.documents.replace(user.tenantId, id, file);
  }

  @Delete(':id')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.documents.remove(user.tenantId, id);
  }
}

function attachmentDisposition(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}
