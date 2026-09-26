package com.panitas.pos;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.concurrent.RejectedExecutionException;

public final class LatestTaskQueueTest {
    public static void main(String[] args) {
        ArrayDeque<Runnable> jobs = new ArrayDeque<>();
        List<Integer> output = new ArrayList<>();
        List<RuntimeException> errors = new ArrayList<>();
        LatestTaskQueue queue = new LatestTaskQueue(jobs::add, errors::add);
        for (int i = 0; i < 1000; i++) {
            final int value = i;
            queue.submit(() -> output.add(value));
        }
        check(jobs.size() == 1, "Only one worker may be queued");
        jobs.remove().run();
        check(output.equals(Arrays.asList(999)), "Only the latest pending total is sent");
        queue.submit(() -> {
            output.add(1000);
            queue.submit(() -> output.add(1001));
            queue.submit(() -> output.add(1002));
        });
        jobs.remove().run();
        check(output.equals(Arrays.asList(999, 1000, 1002)), "A running update completes; the newest follows");
        queue.submit(() -> { queue.submit(() -> output.add(1003)); throw new IllegalStateException("display disconnected"); });
        jobs.remove().run();
        check(errors.size() == 1 && output.get(output.size() - 1) == 1003, "A failure cannot stall the queue");
        queue.submit(() -> output.add(1004));
        queue.close(); jobs.remove().run(); queue.submit(() -> output.add(1005));
        check(jobs.isEmpty() && output.get(output.size() - 1) == 1003, "Closing discards pending display tasks");
        LatestTaskQueue rejected = new LatestTaskQueue(task -> { throw new RejectedExecutionException(); }, errors::add);
        rejected.submit(() -> {});
        check(errors.size() == 2, "Executor shutdown is handled safely");
        System.out.println("LatestTaskQueue: burst, in-flight replacement, failure recovery and shutdown OK.");
    }
    private static void check(boolean result, String message) {
        if (!result) throw new AssertionError(message);
    }
}
