package com.panitas.pos;

import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Rect;
import android.graphics.Typeface;
import java.util.ArrayList;
import java.util.List;

/** Measured layout for 80 mm / 576-dot receipts. No fixed paper/page height. */
public final class ReceiptRenderer {
    public static final int WIDTH = 576;
    private static final int MARGIN = 12;
    private static final int CONTENT = WIDTH - MARGIN * 2;
    private static final int BOTTOM = 8;
    private static final int MAX_HEIGHT = 30000;
    private ReceiptRenderer() {}

    private static final class Row {
        String left = "", right = "";
        Paint paint;
        int height;
        float baseline;
        boolean centered, rightAligned, rule;
        Row(int space) { height = space; }
    }

    public static Bitmap render(String text, Bitmap logo) {
        if (text == null || text.trim().isEmpty()) return null;
        if (text.length() > 200000) throw new IllegalArgumentException("Ticket demasiado largo.");
        boolean includeLogo = text.contains("[LOGO]") && logo != null;
        Bitmap printedLogo = includeLogo ? fitLogo(logo) : null;
        Paint normal = paint(24f, false), bold = paint(26f, true);
        Paint title = paint(28f, true), centered = paint(23f, false);
        List<Row> rows = new ArrayList<>();
        for (String raw : text.split("\\r?\\n", -1)) {
            String line = raw.replace('\t', ' ').replaceAll("[\\p{Cc}&&[^\\n]]", "").trim();
            if (line.startsWith("[LOGO]")) continue;
            if (line.isEmpty()) {
                // Ignore leading/trailing empty lines; collapse repeated gaps.
                if (!rows.isEmpty() && rows.get(rows.size() - 1).paint != null) rows.add(new Row(4));
                continue;
            }
            if (line.startsWith("[SEP]") || line.matches("[-=]{3,}")) {
                if (!rows.isEmpty() && !rows.get(rows.size() - 1).rule) {
                    Row row = new Row(8); row.rule = true; rows.add(row);
                }
                continue;
            }
            boolean isTitle = false, isBold = false, isCentered = false, isRight = false;
            boolean prefix = true;
            while (prefix) {
                if (line.startsWith("[TITLE]")) { isTitle = true; isCentered = true; line = line.substring(7).trim(); }
                else if (line.startsWith("[B]")) { isBold = true; line = line.substring(3).trim(); }
                else if (line.startsWith("[C]")) { isCentered = true; line = line.substring(3).trim(); }
                else if (line.startsWith("[R]")) { isRight = true; line = line.substring(3).trim(); }
                else prefix = false;
            }
            if (isTitle && printedLogo != null && line.toUpperCase(java.util.Locale.ROOT).contains("PANITAS")) continue;
            Paint selected = isTitle ? title : isBold ? bold : isCentered ? centered : normal;
            int split = line.lastIndexOf("  ");
            if (split > 0 && !isCentered && !isRight) {
                addColumns(rows, line.substring(0, split).trim(), line.substring(split).trim(), selected);
            } else {
                for (String part : wrap(line, selected, CONTENT)) rows.add(textRow(part, "", selected, isCentered, isRight));
            }
        }
        while (!rows.isEmpty() && rows.get(rows.size() - 1).paint == null) rows.remove(rows.size() - 1);
        if (rows.isEmpty() && printedLogo == null) return null;
        int height = 6 + BOTTOM + (printedLogo == null ? 0 : printedLogo.getHeight() + 8);
        for (Row row : rows) {
            height += row.height;
            if (height > MAX_HEIGHT) {
                if (printedLogo != null && printedLogo != logo) printedLogo.recycle();
                throw new IllegalArgumentException("Ticket demasiado largo; imprime menos líneas por documento.");
            }
        }
        Bitmap result = Bitmap.createBitmap(WIDTH, Math.max(1, height), Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(result);
        canvas.drawColor(Color.WHITE);
        int y = 6;
        if (printedLogo != null) {
            Paint imagePaint = new Paint(); imagePaint.setFilterBitmap(true);
            canvas.drawBitmap(printedLogo, (WIDTH - printedLogo.getWidth()) / 2f, y, imagePaint);
            y += printedLogo.getHeight() + 8;
            if (printedLogo != logo) printedLogo.recycle();
        }
        Paint separator = paint(1, false); separator.setStrokeWidth(1.5f);
        for (Row row : rows) {
            if (row.rule) canvas.drawLine(MARGIN, y + row.height / 2f, WIDTH - MARGIN, y + row.height / 2f, separator);
            else if (row.paint != null) {
                float x = row.centered ? (WIDTH - row.paint.measureText(row.left)) / 2f
                    : row.rightAligned ? WIDTH - MARGIN - row.paint.measureText(row.left) : MARGIN;
                canvas.drawText(row.left, x, y + row.baseline, row.paint);
                if (!row.right.isEmpty()) canvas.drawText(row.right, WIDTH - MARGIN - row.paint.measureText(row.right), y + row.baseline, row.paint);
            }
            y += row.height;
        }
        return result;
    }

    private static Paint paint(float size, boolean bold) {
        Paint paint = new Paint(); paint.setColor(Color.BLACK); paint.setTextSize(size);
        paint.setTypeface(Typeface.create("sans-serif", bold ? Typeface.BOLD : Typeface.NORMAL));
        paint.setAntiAlias(true);
        return paint;
    }

    private static Bitmap fitLogo(Bitmap logo) {
        // Pixel dimensions, not Android display density, determine paper consumed.
        float scale = Math.min(1f, Math.min(500f / logo.getWidth(), 260f / logo.getHeight()));
        return Bitmap.createScaledBitmap(logo, Math.max(1, Math.round(logo.getWidth() * scale)),
            Math.max(1, Math.round(logo.getHeight() * scale)), true);
    }

    private static Row textRow(String left, String right, Paint paint, boolean center, boolean alignRight) {
        Row row = new Row(0);
        row.left = left; row.right = right; row.paint = paint; row.centered = center; row.rightAligned = alignRight;
        Paint.FontMetrics metrics = paint.getFontMetrics();
        Rect bounds = new Rect(); String combined = left + right;
        paint.getTextBounds(combined, 0, combined.length(), bounds);
        float top = Math.min(metrics.ascent, bounds.top), bottom = Math.max(metrics.descent, bounds.bottom);
        row.baseline = 1 - top;
        row.height = (int)Math.ceil(bottom - top) + 3;
        return row;
    }

    private static void addColumns(List<Row> rows, String left, String right, Paint paint) {
        left = left.replaceAll("\\s+", " "); right = right.replaceAll("\\s+", " ");
        float rightWidth = paint.measureText(right);
        if (rightWidth > CONTENT * .52f) {
            // Never squeeze two wide columns into each other or clip a large total.
            for (String part : wrap(left, paint, CONTENT)) rows.add(textRow(part, "", paint, false, false));
            for (String part : wrap(right, paint, CONTENT)) rows.add(textRow(part, "", paint, false, true));
            return;
        }
        List<String> wrapped = wrap(left, paint, CONTENT - rightWidth - 18);
        for (int i = 0; i < wrapped.size(); i++) rows.add(textRow(wrapped.get(i), i == 0 ? right : "", paint, false, false));
    }

    private static List<String> wrap(String text, Paint paint, float maxWidth) {
        List<String> parts = new ArrayList<>();
        String remaining = text.replaceAll("\\s+", " ").trim();
        while (!remaining.isEmpty()) {
            int count = paint.breakText(remaining, true, Math.max(1f, maxWidth), null);
            if (count < remaining.length() && Character.isHighSurrogate(remaining.charAt(count - 1))) count--;
            if (count <= 0) count = Character.charCount(remaining.codePointAt(0));
            if (count < remaining.length()) {
                int lastSpace = remaining.lastIndexOf(' ', count);
                if (lastSpace > 0) count = lastSpace;
            }
            parts.add(remaining.substring(0, count).trim());
            remaining = remaining.substring(count).trim();
        }
        if (parts.isEmpty()) parts.add("");
        return parts;
    }
}
