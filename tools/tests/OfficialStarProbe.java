package com.panitas.pos.tests;

import android.graphics.*;
import com.starmicronics.starioextension.*;
import java.io.*;

/** Generates a reference stream via the official SDK; never sends it to hardware. */
public final class OfficialStarProbe {
    public static void main(String[] args) throws Exception {
        Typeface type = Typeface.create("sans-serif", Typeface.NORMAL);
        Bitmap bitmap = Bitmap.createBitmap(576, 160, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bitmap); canvas.drawColor(Color.WHITE);
        Paint paint = new Paint(); paint.setColor(Color.BLACK); paint.setTypeface(type); paint.setTextSize(28);
        canvas.drawText("PRUEBA STAR OFICIAL", 20, 48, paint);
        canvas.drawText("SIN VENTA / SIN GAVETA", 20, 90, paint);
        canvas.drawRect(20, 110, 556, 120, paint);
        ICommandBuilder builder = StarIoExt.createCommandBuilder(StarIoExt.Emulation.StarGraphic);
        builder.beginDocument(); builder.appendBitmap(bitmap, false);
        builder.appendCutPaper(ICommandBuilder.CutPaperAction.PartialCutWithFeed);
        builder.endDocument();
        byte[] data = builder.getCommands();
        try (FileOutputStream out = new FileOutputStream(args[0])) { out.write(data); }
        StringBuilder hex = new StringBuilder();
        for (int i = 0; i < Math.min(100, data.length); i++) hex.append(String.format("%02x ", data[i] & 255));
        System.out.println("SDK=" + StarIoExt.getDescription() + " bytes=" + data.length + " prefix=" + hex);
        hex.setLength(0);
        for (int i = Math.max(0, data.length - 70); i < data.length; i++) hex.append(String.format("%02x ", data[i] & 255));
        System.out.println("suffix=" + hex);
        bitmap.recycle();
    }
}
