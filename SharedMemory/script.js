// --- SortedArrayQueue Class ---
// Replaces MinMaxHeap for better stability and correctness with small datasets
class SortedArrayQueue {
    constructor() {
        this.nums = []; // Sorted ascending: [Min, ..., Max]
    }

    // Insert value and keep array sorted
    push(value) {
        // Binary search for insertion point could be used, but for small N, linear is fine
        let inserted = false;
        for (let i = 0; i < this.nums.length; i++) {
            if (value < this.nums[i]) {
                this.nums.splice(i, 0, value);
                inserted = true;
                break;
            }
        }
        if (!inserted) {
            this.nums.push(value);
        }
    }

    // Remove and return the maximum value (last element)
    popMax() {
        if (this.isEmpty()) return null;
        return this.nums.pop();
    }

    // Remove and return the minimum value (first element)
    popMin() {
        if (this.isEmpty()) return null;
        return this.nums.shift();
    }

    // Get maximum value without removing
    getMax() {
        if (this.isEmpty()) return -1;
        return this.nums[this.nums.length - 1];
    }

    // Get minimum value without removing
    getMin() {
        if (this.isEmpty()) return -1;
        return this.nums[0];
    }

    // Increase the priority of the lowest priority element (Aging)
    modifyMin(factor) {
        if (this.isEmpty()) return;
        let min = this.nums.shift(); // Remove min
        min += factor;               // Increase priority
        this.push(min);              // Re-insert in sorted order
    }

    isEmpty() {
        return this.nums.length === 0;
    }

    getElements() {
        // Return reversed copy so UI shows Highest Priority first
        return [...this.nums].reverse();
    }

    get length() {
        return this.nums.length;
    }
}

// --- SharedMemory Class ---
class SharedMemory {
    constructor(size = 5, agingFactor = 5) {
        this.readCount = 0;
        this.writeCount = 0;
        this.eraseCount = 0;
        this.semaphore = size;
        this.bufferSize = size;
        this.agingFactor = agingFactor;

        // Use SortedArrayQueue instead of MinMaxHeap
        this.readHeap = new SortedArrayQueue();
        this.writeHeap = new SortedArrayQueue();
        this.eraseHeap = new SortedArrayQueue();

        this.listeners = [];
        this.logs = [];

        // Time Quantum Logic
        this.QUANTA_TIME = 30000; // Default 30 seconds
        this.readTimeouts = [];
        this.writeTimeouts = [];
        this.eraseTimeouts = [];

        // Track active processes for UI timers: { type, id, startTime, duration }
        this.activeProcesses = [];
    }

    subscribe(listener) {
        this.listeners.push(listener);
        this.notify();
    }

    notify() {
        const state = {
            readCount: this.readCount,
            writeCount: this.writeCount,
            eraseCount: this.eraseCount,
            semaphore: this.semaphore,
            bufferSize: this.bufferSize,
            readHeap: this.readHeap.getElements(),
            writeHeap: this.writeHeap.getElements(),
            eraseHeap: this.eraseHeap.getElements(),
            logs: [...this.logs],
            activeProcesses: [...this.activeProcesses],
            quantaTime: this.QUANTA_TIME
        };
        this.listeners.forEach(l => l(state));
    }

    log(message) {
        console.log(message);
        this.logs.push(message);
        if (this.logs.length > 50) this.logs.shift();
    }

    clearLogs() {
        this.logs = [];
        this.notify();
    }

    setQuantumTime(ms) {
        this.QUANTA_TIME = ms;
        this.log(`Time Quantum updated to ${ms / 1000}s`);
        this.notify();
    }

    setBufferSize(newSize) {
        const used = this.bufferSize - this.semaphore;
        this.bufferSize = newSize;
        this.semaphore = this.bufferSize - used;
        this.log(`Buffer Size updated to ${this.bufferSize}`);
        this.notify();
    }

    modifyMinOfAllQueue() {
        if (!this.readHeap.isEmpty()) {
            this.readHeap.modifyMin(this.agingFactor);
        }
        if (!this.writeHeap.isEmpty()) {
            this.writeHeap.modifyMin(this.agingFactor);
        }
        if (!this.eraseHeap.isEmpty()) {
            this.eraseHeap.modifyMin(this.agingFactor);
        }
    }

    isValidToRead() {
        if (this.readHeap.isEmpty()) return false;

        const currentMax = this.readHeap.getMax();

        if (this.writeHeap.isEmpty() || (!this.writeHeap.isEmpty() && currentMax >= this.writeHeap.getMax())) {
            if (this.eraseHeap.isEmpty() || (!this.eraseHeap.isEmpty() && currentMax >= this.eraseHeap.getMax())) {
                return true;
            }
        }
        return false;
    }

    isValidToWrite() {
        if (!this.writeHeap.isEmpty()) {
            const wr = this.writeHeap.getMax();
            if (this.readHeap.isEmpty() || (!this.readHeap.isEmpty() && wr >= this.readHeap.getMax())) {
                if (this.eraseHeap.isEmpty() || (!this.eraseHeap.isEmpty() && wr >= this.eraseHeap.getMax())) {
                    return true;
                }
            }
        }
        return false;
    }

    isValidToErase() {
        if (!this.eraseHeap.isEmpty()) {
            const er = this.eraseHeap.getMax();
            if (this.readHeap.isEmpty() || (!this.readHeap.isEmpty() && er >= this.readHeap.getMax())) {
                if (this.writeHeap.isEmpty() || (!this.writeHeap.isEmpty() && er >= this.writeHeap.getMax())) {
                    return true;
                }
            }
        }
        return false;
    }

    read(priority) {
        this.readHeap.push(priority);
        this.log(`Request READ with priority ${priority}`);
        this.attemptRead();
        this.notify();
    }

    attemptRead() {
        if (this.semaphore <= 0) return;
        if (this.semaphore > this.bufferSize) return;

        if (this.isValidToRead() && !this.writeCount && !this.eraseCount) {
            this.readCount += 1;
            this.semaphore -= 1;
            this.log(`Allowed to read. Count = ${this.readCount}`);

            // Schedule Timeout
            const duration = this.QUANTA_TIME;
            const timeoutId = setTimeout(() => {
                this.log("⚠️ Reader timed out (Preempted & Re-queued)");
                this.signalRead();
                this.read(10); // Round Robin: Re-queue with default priority
            }, duration);
            this.readTimeouts.push(timeoutId);

            // Track active process
            this.activeProcesses.push({
                type: 'READ',
                id: timeoutId, // Use timeout ID as unique identifier
                startTime: Date.now(),
                duration: duration
            });

            // Remove the reader that just got access
            this.readHeap.popMax();



            // Recursive check for next reader
            if (this.isValidToRead()) {
                this.attemptRead();
            }
        }
    }

    write(priority) {
        this.writeHeap.push(priority);
        this.log(`Request WRITE with priority ${priority}`);
        this.attemptWrite();
        this.notify();
    }

    attemptWrite() {
        if (this.semaphore <= 0) return;

        if (this.isValidToWrite() && !this.readCount && !this.writeCount && !this.eraseCount) {
            this.writeHeap.popMax();
            this.writeCount += 1;
            this.semaphore -= 1;
            this.log(`Allowed to write. Count = ${this.writeCount}`);

            // Schedule Timeout
            const duration = this.QUANTA_TIME;
            const timeoutId = setTimeout(() => {
                this.log("⚠️ Writer timed out (Preempted & Re-queued)");
                this.signalWrite();
                this.write(10); // Round Robin: Re-queue with default priority
            }, duration);
            this.writeTimeouts.push(timeoutId);

            // Track active process
            this.activeProcesses.push({
                type: 'WRITE',
                id: timeoutId,
                startTime: Date.now(),
                duration: duration
            });


        }
    }

    erase(priority) {
        this.eraseHeap.push(priority);
        this.log(`Request ERASE with priority ${priority}`);
        this.attemptErase();
        this.notify();
    }

    attemptErase() {
        if (this.semaphore <= 0) return;

        if (this.isValidToErase() && !this.readCount && !this.writeCount && !this.eraseCount) {
            this.eraseHeap.popMax();
            this.eraseCount += 1;
            this.semaphore -= 1;
            this.log(`Allowed to erase. Count = ${this.eraseCount}`);

            // Schedule Timeout
            const duration = this.QUANTA_TIME;
            const timeoutId = setTimeout(() => {
                this.log("⚠️ Eraser timed out (Preempted & Re-queued)");
                this.signalErase();
                this.erase(10); // Round Robin: Re-queue with default priority
            }, duration);
            this.eraseTimeouts.push(timeoutId);

            // Track active process
            this.activeProcesses.push({
                type: 'ERASE',
                id: timeoutId,
                startTime: Date.now(),
                duration: duration
            });


        }
    }

    signalRead() {
        if (this.readCount <= 0) {
            this.log("Error: No active readers to signal.");
            this.notify();
            return;
        }

        // Clear oldest timeout
        if (this.readTimeouts.length > 0) {
            const id = this.readTimeouts.shift();
            clearTimeout(id);
            // Remove from active processes
            this.activeProcesses = this.activeProcesses.filter(p => p.id !== id);
        }

        this.readCount -= 1;
        this.semaphore += 1;
        this.log(`Signal READ. Semaphore = ${this.semaphore}`);

        this.modifyMinOfAllQueue();
        this.signalAll();
        this.notify();
    }

    signalWrite() {
        if (this.writeCount <= 0) {
            this.log("Error: No active writers to signal.");
            this.notify();
            return;
        }

        // Clear oldest timeout
        if (this.writeTimeouts.length > 0) {
            const id = this.writeTimeouts.shift();
            clearTimeout(id);
            // Remove from active processes
            this.activeProcesses = this.activeProcesses.filter(p => p.id !== id);
        }

        this.writeCount -= 1;
        this.semaphore += 1;
        this.log(`Signal WRITE. Semaphore = ${this.semaphore}`);
        this.modifyMinOfAllQueue();
        this.signalAll();
        this.notify();
    }

    signalErase() {
        if (this.eraseCount <= 0) {
            this.log("Error: No active erasers to signal.");
            this.notify();
            return;
        }

        // Clear oldest timeout
        if (this.eraseTimeouts.length > 0) {
            const id = this.eraseTimeouts.shift();
            clearTimeout(id);
            // Remove from active processes
            this.activeProcesses = this.activeProcesses.filter(p => p.id !== id);
        }

        this.eraseCount -= 1;
        this.semaphore += 1;
        this.log(`Signal ERASE. Semaphore = ${this.semaphore}`);
        this.modifyMinOfAllQueue();
        this.signalAll();
        this.notify();
    }

    signalAll() {
        if (this.isValidToRead()) {
            this.attemptRead();
        } else if (this.isValidToWrite()) {
            this.attemptWrite();
        } else if (this.isValidToErase()) {
            this.attemptErase();
        }
    }

    setAgingFactor(factor) {
        this.agingFactor = factor;
        this.log(`Aging Factor updated to ${this.agingFactor}`);
    }
}

// --- UI Logic ---
const sharedMemory = new SharedMemory(5, 5);

const app = {
    addProcess: (type) => {
        const priority = parseInt(document.getElementById('priority-input').value) || 0;
        if (type === 'READ') sharedMemory.read(priority);
        if (type === 'WRITE') sharedMemory.write(priority);
        if (type === 'ERASE') sharedMemory.erase(priority);
    },
    signal: (type) => {
        if (type === 'READ') sharedMemory.signalRead();
        if (type === 'WRITE') sharedMemory.signalWrite();
        if (type === 'ERASE') sharedMemory.signalErase();
    },
    updateAgingFactor: () => {
        const factor = parseInt(document.getElementById('aging-input').value) || 5;
        sharedMemory.setAgingFactor(factor);
    },
    updateQuantumTime: () => {
        const seconds = parseInt(document.getElementById('quantum-input').value) || 30;
        sharedMemory.setQuantumTime(seconds * 1000);
    },
    updateBufferSize: () => {
        const size = parseInt(document.getElementById('buffer-input').value) || 5;
        sharedMemory.setBufferSize(size);
    },
    clearLogs: () => {
        sharedMemory.clearLogs();
    }
};

function renderQueue(elementId, heap) {
    const container = document.getElementById(elementId);
    container.innerHTML = '';
    if (heap.length === 0) {
        container.innerHTML = '<div style="padding:10px; text-align:center; opacity:0.3; font-size:10px;">EMPTY</div>';
        return;
    }
    heap.forEach(priority => {
        const div = document.createElement('div');
        div.className = "queue-item";
        div.innerHTML = `
            <span>Process</span>
            <span class="p-badge">P: ${priority}</span>
        `;
        container.appendChild(div);
    });
}

function renderState(state) {
    // Update Queues
    renderQueue('read-queue', state.readHeap);
    renderQueue('write-queue', state.writeHeap);
    renderQueue('erase-queue', state.eraseHeap);

    // Update Badges
    document.getElementById('read-count-badge').textContent = state.readHeap.length;
    document.getElementById('write-count-badge').textContent = state.writeHeap.length;
    document.getElementById('erase-count-badge').textContent = state.eraseHeap.length;

    // Update Stats
    document.getElementById('val-semaphore').textContent = state.semaphore;
    document.getElementById('val-total').textContent = state.bufferSize;
    document.getElementById('val-readers').textContent = state.readCount;
    document.getElementById('val-writers').textContent = state.writeCount;
    document.getElementById('val-erasers').textContent = state.eraseCount;

    // Update Buffer Visual
    const used = state.bufferSize - state.semaphore;
    document.getElementById('buffer-usage-text').textContent = `${used} / ${state.bufferSize}`;
    const bufferContainer = document.getElementById('buffer-visual');
    bufferContainer.innerHTML = '';
    for (let i = 0; i < state.bufferSize; i++) {
        const div = document.createElement('div');
        div.className = `buffer-segment ${i < used ? 'active' : 'inactive'}`;
        bufferContainer.appendChild(div);
    }

    // Update Logs
    const logContainer = document.getElementById('log-container');
    logContainer.innerHTML = '';
    if (state.logs.length === 0) {
        logContainer.innerHTML = '<div class="log-entry" style="opacity:0.5">System ready...</div>';
    } else {
        state.logs.forEach(log => {
            const div = document.createElement('div');
            const isError = log.startsWith('Error') || log.includes('timed out');
            div.className = `log-entry ${isError ? 'log-err' : ''}`;
            const t = new Date().toLocaleTimeString().split(' ')[0];
            div.innerHTML = `<span class="log-time">[${t}]</span>${log}`;
            logContainer.appendChild(div);
        });
        // Auto scroll
        logContainer.scrollTop = logContainer.scrollHeight;
    }
}

// Timer Logic
setInterval(() => {
    const now = Date.now();
    const active = sharedMemory.activeProcesses;

    // Helper to get min remaining time for a type
    const getMinTime = (type) => {
        const processes = active.filter(p => p.type === type);
        if (processes.length === 0) return null;
        const times = processes.map(p => Math.max(0, Math.ceil((p.startTime + p.duration - now) / 1000)));
        return Math.min(...times);
    };

    const updateTimerDisplay = (id, time) => {
        const el = document.getElementById(id);
        if (time !== null) {
            el.textContent = `⏱️ ${time}s`;
            el.classList.add('animate-pulse');
        } else {
            el.textContent = '';
            el.classList.remove('animate-pulse');
        }
    };

    updateTimerDisplay('timer-readers', getMinTime('READ'));
    updateTimerDisplay('timer-writers', getMinTime('WRITE'));
    updateTimerDisplay('timer-erasers', getMinTime('ERASE'));

}, 100);

// Initialize Icons
lucide.createIcons();

// Subscribe to updates
sharedMemory.subscribe(renderState);
