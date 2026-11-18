-- CreateEnum
CREATE TYPE "LoginSecurity" AS ENUM ('SINGLE', 'BOTH');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "loginSecurity" "LoginSecurity" NOT NULL DEFAULT 'SINGLE';
