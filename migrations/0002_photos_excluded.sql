-- タイムラプス対象外フラグ (1 = 対象外)。アルバムには表示するが動画生成には使わない
ALTER TABLE photos ADD COLUMN excluded INTEGER NOT NULL DEFAULT 0;
