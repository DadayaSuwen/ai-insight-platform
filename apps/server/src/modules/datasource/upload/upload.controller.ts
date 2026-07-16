import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  MaxFileSizeValidator,
  Param,
  ParseFilePipe,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { diskStorage } from "multer";
import { extname } from "path";
import { randomUUID } from "crypto";
import * as fs from "fs";
import * as path from "path";
import { z } from "zod";
import { UploadService } from "./upload.service";
import { SemanticInferenceService } from "../metadata/semantic-inference.service";
import { JwtAuthGuard } from "../../auth/auth.guard";
import { CurrentUser } from "../../auth/auth.decorators";
import { PermissionsGuard } from "../../rbac/permissions.guard";
import { Permissions } from "../../rbac/permissions.decorator";
import { PERMISSIONS } from "../../rbac/permissions";

/**
 * [Sprint 5.6] CSV 上传 — 流式 PG 入库 (2 步端点)
 *
 *   POST  /api/datasources/upload/preview
 *     multipart form-data: file (CSV, max 50MB)
 *     返回: { uploadId, columns[], previewRows[], rowCount }
 *     —— multer 临时落盘 → CsvImportService.inferSchema()
 *
 *   POST  /api/datasources/upload/register
 *     body: { uploadId, name?, columnOverrides[] }
 *     返回: { id, name, columnCount, rowCount }
 *     —— CREATE TABLE csv_dataset_<uuid> → COPY CSV → 注册 DataSource(type: postgres)
 *
 *   DELETE /api/datasources/upload/:uploadId
 *     —— 取消上传, 删除临时文件
 */

const STORAGE_DIR = path.resolve(process.cwd(), "uploads");
const MAX_BYTES = 50 * 1024 * 1024;

const storage = diskStorage({
  destination: (_req, _file, cb) => {
    if (!fs.existsSync(STORAGE_DIR)) {
      fs.mkdirSync(STORAGE_DIR, { recursive: true });
    }
    cb(null, STORAGE_DIR);
  },
  filename: (_req, file, cb) => {
    // Sprint 4:用 upload-<uuid>.csv 临时命名,register 后再 rename 为 csv-<uuid>.csv
    const safeName = `upload-${randomUUID()}.csv`;
    cb(null, safeName);
  },
});

const fileFilter = (
  _req: unknown,
  file: { mimetype: string; originalname: string },
  cb: (e: Error | null, ok: boolean) => void,
): void => {
  const ext = extname(file.originalname || "").toLowerCase();
  if (ext !== ".csv" && ext !== ".tsv") {
    cb(new Error(`Only .csv/.tsv files allowed, got ${ext}`), false);
    return;
  }
  cb(null, true);
};

const ColumnOverrideSchema = z.object({
  originalName: z.string().min(1).max(200),
  newName: z.string().min(1).max(200),
  type: z.enum(["AUTO", "VARCHAR", "DECIMAL", "DATE", "BOOLEAN"]),
  alias: z.string().max(200).optional(), // [Sprint 5.7+] 用户确认的中文别名
});

const RegisterBodySchema = z.object({
  uploadId: z.string().regex(/^upload-[a-z0-9-]+\.csv$/i),
  name: z.string().min(1).max(200).optional(),
  columnOverrides: z.array(ColumnOverrideSchema).max(200).default([]),
});

@Controller("api/datasources/upload")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class UploadController {
  constructor(
    private readonly uploadService: UploadService,
    private readonly semanticInference: SemanticInferenceService,
  ) {}

  /**
   * Step 1 — 上传 + 预览
   */
  @Post("preview")
  @HttpCode(HttpStatus.CREATED)
  @Permissions(PERMISSIONS.CONNECT_DATASOURCE)
  @UseInterceptors(
    FileInterceptor("file", {
      storage,
      fileFilter,
      limits: { fileSize: MAX_BYTES, files: 1 },
    }),
  )
  async preview(
    @UploadedFile(
      new ParseFilePipe({
        validators: [new MaxFileSizeValidator({ maxSize: MAX_BYTES })],
      }),
    )
    file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException("Missing 'file' form-data field");
    }
    try {
      const result = await this.uploadService.uploadPreview({
        filePath: file.path,
        uploadId: file.filename,
        originalName: file.originalname,
      });
      return { success: true, data: result };
    } catch (err) {
      // 上传失败 — 清理孤儿
      if (file.path && fs.existsSync(file.path)) {
        try {
          fs.unlinkSync(file.path);
        } catch {
          // swallow
        }
      }
      throw err;
    }
  }

  /**
   * [Sprint 5.7+] Step 1.5 — LLM 生成中文别名
   */
  @Post("preview/aliases")
  @HttpCode(HttpStatus.OK)
  @Permissions(PERMISSIONS.CONNECT_DATASOURCE)
  async previewAliases(
    @Body() body: { columns: Array<{ name: string; samples: string[] }> },
  ) {
    const aliases = await this.semanticInference.inferAliases(
      body.columns ?? [],
      "preview",
    );
    return { success: true, data: { aliases: aliases ?? {} } };
  }

  /**
   * Step 2 — 用 preview 结果注册 DataSource
   */
  @Post("register")
  @HttpCode(HttpStatus.CREATED)
  @Permissions(PERMISSIONS.CONNECT_DATASOURCE)
  async register(@Body() body: unknown, @CurrentUser() user: { sub: string }) {
    const parsed = RegisterBodySchema.parse(body);
    const overrides = parsed.columnOverrides.map(c => ({
      originalName: c.originalName,
      newName: c.newName,
      type: c.type,
      alias: c.alias, // [Sprint 5.7+]
    }));
    const result = await this.uploadService.registerFromPreview({
      userId: user.sub, // [Sprint 5]
      uploadId: parsed.uploadId,
      datasetName: parsed.name ?? "",
      columnOverrides: overrides,
    });
    return { success: true, data: result };
  }

  /**
   * 取消上传 + 清理临时文件
   */
  @Delete(":uploadId")
  @HttpCode(HttpStatus.NO_CONTENT)
  cancel(@Param("uploadId") uploadId: string) {
    if (!/^upload-[a-z0-9-]+\.csv$/i.test(uploadId)) {
      throw new BadRequestException(`Invalid uploadId format: ${uploadId}`);
    }
    this.uploadService.cancelUpload(uploadId);
  }
}

export const UPLOAD_MAX_BYTES = MAX_BYTES;