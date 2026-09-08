package com.panitas.pos.tests;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Typeface;
import java.io.File;
import java.io.FileOutputStream;
import java.lang.reflect.Method;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.json.JSONArray;
import org.json.JSONObject;

/** Standalone Android raster tests. No Context, app install, business data or printer calls. */
public final class ReceiptRendererHarness {
    private static final int PAPER_WIDTH = 576;

    public static void main(String[] args) throws Exception {
        if (args.length < 2) throw new IllegalArgumentException("outputDir logoPath [--probe]");
        File output = new File(args[0]);
        if (!output.getCanonicalPath().startsWith("/data/local/tmp/panitas-receipt-review/")) {
            throw new IllegalArgumentException("Output must stay inside the isolated receipt test directory");
        }
        if (!output.isDirectory() && !output.mkdirs()) throw new IllegalStateException("Cannot create output directory");
        Bitmap logo = BitmapFactory.decodeFile(args[1]);
        if (logo == null) throw new IllegalArgumentException("Cannot decode receipt logo");
        // app_process does not preload zygote's font state. Explicitly loading the
        // standard Typeface initializes Android 8's default native font collection.
        Typeface defaultTypeface = Typeface.create("sans-serif", Typeface.NORMAL);

        if (args.length > 2 && "--probe".equals(args[2])) {
            Bitmap bitmap = Bitmap.createBitmap(PAPER_WIDTH, 180, Bitmap.Config.ARGB_8888);
            Canvas canvas = new Canvas(bitmap);
            canvas.drawColor(Color.WHITE);
            Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
            paint.setTypeface(defaultTypeface);
            paint.setColor(Color.BLACK);
            paint.setTextSize(24);
            canvas.drawText("Android Canvas: prueba sin imprimir", 16, 35, paint);
            canvas.drawBitmap(logo, null, new android.graphics.Rect(180, 50, 396, 160), paint);
            saveBitmap(output, "graphics-probe", bitmap);
            System.out.println("GRAPHICS_PROBE_OK " + bitmap.getWidth() + "x" + bitmap.getHeight());
            bitmap.recycle();
            logo.recycle();
            return;
        }

        Method render = Class.forName("com.panitas.pos.ReceiptRenderer").getMethod("render", String.class, Bitmap.class);
        if (args.length > 5 && "--apk".equals(args[4])) {
            Class.forName("com.panitas.pos.tests.BundledWebAppHarness").getMethod("verify", String.class).invoke(null, args[5]);
        }
        // This is a pure static encoder. Never instantiate the USB manager, call
        // sendBytes, open a USB connection, or issue real printer/drawer commands.
        Method raster = Class.forName("com.panitas.pos.UsbPrinterManager").getMethod("bitmapToStarRaster", Bitmap.class, boolean.class);
        JSONObject report = new JSONObject();
        report.put("device", android.os.Build.MODEL);
        report.put("android", android.os.Build.VERSION.RELEASE);
        report.put("scope", "Synthetic raster rendering only; no apps installed, receipts printed, sales or business records created");
        JSONArray results = new JSONArray();
        List<String> failures = new ArrayList<String>();
        Map<String, String> allCases = cases();
        if (args.length > 3 && "--fixtures".equals(args[2])) {
            File fixtures = new File(args[3]);
            File[] inputs = fixtures.listFiles();
            if (inputs == null) throw new IllegalArgumentException("Cannot read generated fixtures");
            Arrays.sort(inputs);
            for (File input : inputs) {
                if (input.isFile() && input.getName().matches("[a-z0-9-]+\\.txt")) {
                    allCases.put(input.getName().replaceFirst("\\.txt$", ""), new String(Files.readAllBytes(input.toPath()), StandardCharsets.UTF_8));
                }
            }
        }
        for (Map.Entry<String, String> entry : allCases.entrySet()) {
            Bitmap bitmap = (Bitmap) render.invoke(null, entry.getValue(), logo);
            if (bitmap == null) throw new IllegalStateException(entry.getKey() + ": renderer returned null");
            JSONObject metrics = inspectBitmap(entry.getKey(), bitmap, failures);
            metrics.put("starRasterBytes", verifyRaster(entry.getKey(), bitmap, raster, failures));
            results.put(metrics);
            saveBitmap(output, entry.getKey(), bitmap);
            Files.write(new File(output, entry.getKey() + ".txt").toPath(), entry.getValue().getBytes(StandardCharsets.UTF_8));
            bitmap.recycle();
        }

        // Trailing whitespace must not produce a blank piece of receipt paper.
        String base = shortReceipt();
        Bitmap compact = (Bitmap) render.invoke(null, base, logo);
        Bitmap blanks = (Bitmap) render.invoke(null, base + "\n\n\n   \n\n\n\n\n\n\n", logo);
        int heightDifference = blanks.getHeight() - compact.getHeight();
        report.put("trailingBlankHeightDifferenceDots", heightDifference);
        if (heightDifference > 16) failures.add("Trailing blank lines add " + heightDifference + " dots of unnecessary paper");
        compact.recycle();
        blanks.recycle();
        Bitmap bitBoundary = Bitmap.createBitmap(9, 3, Bitmap.Config.ARGB_8888);
        bitBoundary.eraseColor(Color.WHITE);
        bitBoundary.setPixel(0, 0, Color.BLACK);
        bitBoundary.setPixel(7, 0, Color.BLACK);
        bitBoundary.setPixel(8, 0, Color.BLACK);
        bitBoundary.setPixel(0, 1, Color.rgb(159, 159, 159));
        bitBoundary.setPixel(1, 1, Color.rgb(160, 160, 160));
        bitBoundary.setPixel(2, 1, Color.argb(128, 0, 0, 0));
        bitBoundary.setPixel(3, 1, Color.argb(129, 0, 0, 0));
        report.put("starRasterBitBoundaryBytes", verifyRaster("9-dot-width-threshold-alpha", bitBoundary, raster, failures));
        bitBoundary.recycle();
        report.put("starRasterContract", "Enter raster before P0/E1/F13; continuous page at bitmap height; b-scanlines; ESC FF NUL prints and cuts once; ESC*rB exits without another cut feed; optional BEL only; no hardware I/O.");
        logo.recycle();
        report.put("cases", results);
        report.put("failures", new JSONArray(failures));
        report.put("passed", failures.isEmpty());
        Files.write(new File(output, "report.json").toPath(), report.toString(2).getBytes(StandardCharsets.UTF_8));
        System.out.println(report.toString(2));
        if (!failures.isEmpty()) System.exit(2);
    }

    private static JSONObject inspectBitmap(String name, Bitmap bitmap, List<String> failures) throws Exception {
        int width = bitmap.getWidth();
        int height = bitmap.getHeight();
        int minX = width, minY = height, maxX = -1, maxY = -1;
        long inkPixels = 0;
        int[] pixels = new int[width];
        for (int y = 0; y < height; y++) {
            bitmap.getPixels(pixels, 0, width, 0, y, width, 1);
            for (int x = 0; x < width; x++) {
                int color = pixels[x];
                if (Color.alpha(color) > 127 && Math.min(Color.red(color), Math.min(Color.green(color), Color.blue(color))) < 200) {
                    minX = Math.min(minX, x);
                    minY = Math.min(minY, y);
                    maxX = Math.max(maxX, x);
                    maxY = Math.max(maxY, y);
                    inkPixels++;
                }
            }
        }
        int bottomWhiteDots = maxY < 0 ? height : height - maxY - 1;
        JSONObject result = new JSONObject();
        result.put("case", name);
        result.put("widthDots", width);
        result.put("heightDots", height);
        result.put("paperLengthMmAt203dpi", Math.round(height / 203.0 * 25.4 * 10.0) / 10.0);
        result.put("firstInkX", minX);
        result.put("lastInkX", maxX);
        result.put("firstInkY", minY);
        result.put("lastInkY", maxY);
        result.put("bottomWhiteDots", bottomWhiteDots);
        result.put("inkPixels", inkPixels);
        if (width != PAPER_WIDTH) failures.add(name + ": expected 576-dot raster, got " + width);
        if (inkPixels == 0) failures.add(name + ": no rendered ink");
        if (minX < 8 || maxX >= width - 8) failures.add(name + ": ink touches paper edge (possible clipping)");
        if (bottomWhiteDots > 20) failures.add(name + ": unnecessary white tail of " + bottomWhiteDots + " dots");
        return result;
    }

    private static void saveBitmap(File output, String name, Bitmap bitmap) throws Exception {
        try (FileOutputStream stream = new FileOutputStream(new File(output, name + ".png"))) {
            if (!bitmap.compress(Bitmap.CompressFormat.PNG, 100, stream)) throw new IllegalStateException("PNG encoding failed");
        }
    }

    private static int verifyRaster(String name, Bitmap bitmap, Method raster, List<String> failures) throws Exception {
        byte[] actual = (byte[]) raster.invoke(null, bitmap, false);
        byte[] withDrawer = (byte[]) raster.invoke(null, bitmap, true);
        byte[] prefix = {
            0x1b, 0x40,
            0x1b, 0x2a, 0x72, 0x52,
            0x1b, 0x2a, 0x72, 0x41,
            0x1b, 0x2a, 0x72, 0x50, '0', 0,
            0x1b, 0x2a, 0x72, 0x45, '1', 0,
            0x1b, 0x2a, 0x72, 0x46, '1', '3', 0,
        };
        byte[] suffix = { 0x1b, 0x0c, 0, 0x1b, 0x2a, 0x72, 0x42 };
        int widthBytes = (bitmap.getWidth() + 7) / 8;
        int expectedLength = prefix.length + bitmap.getHeight() * (3 + widthBytes) + suffix.length;
        if (actual.length != expectedLength) {
            failures.add(name + ": Star byte length differs; expected " + expectedLength + ", got " + actual.length);
            return actual.length;
        }
        if (!Arrays.equals(prefix, Arrays.copyOfRange(actual, 0, prefix.length))) {
            failures.add(name + ": P0/E1/F13 must follow raster entry, which resets page/end modes");
        }
        int position = prefix.length;
        int[] pixels = new int[bitmap.getWidth()];
        for (int y = 0; y < bitmap.getHeight(); y++) {
            if (actual[position++] != 0x62 || (actual[position++] & 0xff) != (widthBytes & 0xff)
                || (actual[position++] & 0xff) != ((widthBytes >> 8) & 0xff)) {
                failures.add(name + ": invalid Star scanline header at row " + y);
                break;
            }
            bitmap.getPixels(pixels, 0, bitmap.getWidth(), 0, y, bitmap.getWidth(), 1);
            byte[] expected = new byte[widthBytes];
            for (int x = 0; x < pixels.length; x++) {
                int pixel = pixels[x];
                int luminance = (Color.red(pixel) * 299 + Color.green(pixel) * 587 + Color.blue(pixel) * 114) / 1000;
                if (Color.alpha(pixel) > 128 && luminance < 160) expected[x / 8] |= 0x80 >> (x % 8);
            }
            if (!Arrays.equals(expected, Arrays.copyOfRange(actual, position, position + widthBytes))) {
                failures.add(name + ": Star bitmap data mismatch at row " + y);
                break;
            }
            position += widthBytes;
        }
        if (!Arrays.equals(suffix, Arrays.copyOfRange(actual, actual.length - suffix.length, actual.length))) {
            failures.add(name + ": Star stream must print/cut with FF then exit; no extra ESC d feed/cut");
        }
        if (withDrawer.length != actual.length + 1 || withDrawer[withDrawer.length - 1] != 0x07
            || !Arrays.equals(actual, Arrays.copyOf(withDrawer, actual.length))) {
            failures.add(name + ": drawer option must only append one BEL to the same raster stream");
        }
        return actual.length;
    }

    private static String shortReceipt() {
        return "[LOGO]\n[C]Tel: 000-000-0000\n[C]Dirección de prueba de maquetación\n[SEP]\n"
            + "FACTURA DE VENTA: PRUEBA-RENDER-001\nFecha: 06/09/2026 10:30 a. m.\nCliente: PRUEBA DE FORMATO\n[SEP]\n"
            + "CANT.  DESCRIPCIÓN                         TOTAL\n[SEP]\n"
            + "1 x Hamburguesa clásica  RD$ 350.00\n[SEP]\nSubtotal:  RD$ 350.00\n"
            + "[C][B]TOTAL A PAGAR: RD$ 350.00\n[SEP]\nEfectivo recibido:  RD$ 500.00\nCambio:  RD$ 150.00\n"
            + "[SEP]\n[C]¡Gracias por su compra!";
    }

    private static Map<String, String> cases() {
        Map<String, String> cases = new LinkedHashMap<String, String>();
        cases.put("short-receipt", shortReceipt());
        StringBuilder longReceipt = new StringBuilder("[LOGO]\n[TITLE]FACTURA DE PRUEBA DE RENDER\n");
        longReceipt.append("[C]Dirección comercial excepcionalmente larga, avenida principal, edificio número 150, segundo nivel, esquina de referencia\n");
        longReceipt.append("Cliente: Nombre compuesto del cliente con apellidos largos para verificar que el contenido permanezca legible y completo\n[SEP]\n");
        for (int i = 1; i <= 24; i++) {
            longReceipt.append(i).append(" x Hamburguesa doble especial con queso, vegetales y papas para compartir ").append(i).append("  RD$ 1,234.56\n");
        }
        longReceipt.append("[SEP]\nSubtotal:  RD$ 29,629.44\nITBIS:  RD$ 5,333.30\n[C][B]TOTAL A PAGAR: RD$ 34,962.74\n[SEP]\n");
        longReceipt.append("[C]Gracias por visitarnos. Conserva tu comprobante de pago para cualquier aclaración sobre esta compra.\n");
        cases.put("long-receipt", longReceipt.toString());
        cases.put("unbroken-words", "[TITLE]SUPERNOMBRECOMERCIALMUYLARGOSINESPACIOSPARAVERIFICARELCORTE\n[SEP]\n"
            + "CLIENTEABCDEFGHIJKLMNÑOPQRSTUVWXYZABCDEFGHIJKLMNÑOPQRSTUVWXYZABCDEFGHIJKLMNÑOPQRSTUVWXYZ\n"
            + "12345 x PRODUCTOABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJKLMNOPQRSTUVWXYZ  RD$ 999,999.99\n"
            + "[R]REFERENCIA123456789012345678901234567890123456789012345678901234567890\n"
            + "[C][B]TOTAL A PAGAR: RD$ 999,999,999,999.99\n[C]Fin de prueba");
        cases.put("large-amounts", "[TITLE]IMPORTES GRANDES\n[SEP]\n"
            + "99999.999 x Producto con cantidad decimal y descripción larga  RD$ 123,456,789,012.34\n"
            + "Subtotal con un nombre de concepto largo:  RD$ 123,456,789,012.34\n"
            + "Descuento:  -RD$ 1,234,567,890.12\n"
            + "[C][B]TOTAL A PAGAR: RD$ 123,456,789,012.34\n"
            + "[B]BALANCE PENDIENTE: RD$ 123,456,789,012.34\n[C]Fin de prueba");
        cases.put("blank-lines", "\n\n\n" + shortReceipt() + "\n\n\n  \n\n\n\n\n");
        cases.put("no-logo", "[TITLE]LOS PANITAS BY NECHY\n[SEP]\n1 x Prueba sin marcador de logo  RD$ 50.00\n[B][C]TOTAL A PAGAR: RD$ 50.00\n[C]Gracias");
        return cases;
    }
}
