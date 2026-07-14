import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { AuthModule } from "../auth/auth.module";
import { RbacModule } from "../rbac/rbac.module";
import { UsersController } from "./users.controller";

@Module({
  imports: [DatabaseModule, AuthModule, RbacModule],
  controllers: [UsersController],
})
export class UsersModule {}
