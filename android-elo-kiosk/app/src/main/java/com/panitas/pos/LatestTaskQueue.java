package com.panitas.pos;

import java.util.concurrent.Executor;
import java.util.concurrent.RejectedExecutionException;
import java.util.function.Consumer;

/** One running task and at most one pending task, for replaceable display text ONLY.
 * Never use this queue for tickets, drawer pulses or financial operations. */
final class LatestTaskQueue {
    private final Executor executor;
    private final Consumer<RuntimeException> onError;
    private Runnable pending;
    private boolean scheduled;
    private boolean closed;

    LatestTaskQueue(Executor executor, Consumer<RuntimeException> onError) {
        this.executor = executor;
        this.onError = onError;
    }

    synchronized void submit(Runnable task) {
        if (closed) return;
        pending = task;
        if (scheduled) return;
        scheduled = true;
        try {
            executor.execute(this::drain);
        } catch (RejectedExecutionException error) {
            scheduled = false;
            pending = null;
            onError.accept(error);
        }
    }

    private void drain() {
        while (true) {
            Runnable task;
            synchronized (this) {
                task = pending;
                pending = null;
                if (closed || task == null) {
                    scheduled = false;
                    return;
                }
            }
            try {
                task.run();
            } catch (RuntimeException error) {
                onError.accept(error);
            }
        }
    }

    synchronized void close() {
        closed = true;
        pending = null;
    }
}
