-- نوع «أكمل السورة من الآية إلى الآية». ADD VALUE في migration مستقلة عن أي استعمال للقيمة.
ALTER TYPE "QuestionType" ADD VALUE IF NOT EXISTS 'SURAH_RANGE';
