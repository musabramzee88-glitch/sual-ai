-- ورقة إجابة الطالب. ADD VALUE في migration مستقلة عن أي استعمال للقيمة.
ALTER TYPE "ExportVariant" ADD VALUE IF NOT EXISTS 'ANSWER_SHEET';
