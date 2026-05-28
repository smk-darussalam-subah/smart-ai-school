-- =============================================================================
-- Migration: 20260525000002_add_tata_usaha_role
-- Description: Add TATA_USAHA to UserRole enum (staf administrasi sekolah)
-- =============================================================================

-- PostgreSQL ALTER TYPE ADD VALUE tidak bisa di-rollback dalam transaksi,
-- tapi aman dijalankan berulang kali karena menggunakan IF NOT EXISTS
ALTER TYPE "auth"."UserRole" ADD VALUE IF NOT EXISTS 'TATA_USAHA';
