class Sim {
            constructor() {
                this.procs = [];
                this.buffer = [];
                this.pid = 100;
                this.history = [];
                this.future = [];

                this.space = document.getElementById('kernelSpace');
                this.kernel = document.getElementById('kernelNode');
                this.bufUI = document.getElementById('bufferContainer');

                this.qReadyUI = document.getElementById('qReady');
                this.qRunUI = document.getElementById('qRun');
                this.qWaitUI = document.getElementById('qWait');

                this.canvas = document.getElementById('wire-layer');
                this.ctx = this.canvas.getContext('2d');
                this.term = document.getElementById('terminal');

                // Vertical Offset Constant (pixels to shift down)
                this.offsetY = 40; 

                window.addEventListener('resize', () => this.resize());

                document.addEventListener('keydown', (e) => {
                    if (e.ctrlKey || e.metaKey) {
                        if (e.key === 'z') { e.preventDefault(); this.undo(); }
                        if (e.key === 'y') { e.preventDefault(); this.redo(); }
                    }
                });

                this.spawn('root', 'SYS_ROOT', false);
                this.spawn('user', 'SYS_USER', false);
                this.spawn('guest', 'SYS_GUEST', false);
                this.saveState(); this.resize(); this.loop();

                this.resize();
                this.loop();
            }

            snapshot() {
                return {
                    processes: this.procs.map(p => ({
                        id: p.id, name: p.name, type: p.type, x: p.x, y: p.y, state: p.state
                    })),
                    buffer: JSON.parse(JSON.stringify(this.buffer)),
                    pid: this.pid,
                    logHTML: this.term.innerHTML
                };
            }

            saveState() {
                this.history.push(this.snapshot());
                this.future = [];
                if(this.history.length > 50) this.history.shift();
            }

            restore(state) {
                this.pid = state.pid;
                this.buffer = state.buffer;
                this.term.innerHTML = state.logHTML;
                this.term.scrollTop = this.term.scrollHeight;

                this.procs.forEach(p => { if(p.el) p.el.remove(); });
                
                this.procs = state.processes.map(data => {
                    const el = document.createElement('div');
                    el.className = `node ${data.type} state-${data.state.toLowerCase()}`;
                    el.innerHTML = `<span>${data.name}</span><div class="pid">PID:${data.id}</div><div class="status-badge">${data.state}</div>`;
                    this.space.appendChild(el);
                    return { ...data, el: el };
                });

                this.placeNodes();
                this.renderBuf();
                this.updateScheduler();
                this.updateUI();
            }

            undo() {
                if(this.history.length <= 1) return;
                const curr = this.history.pop();
                this.future.push(curr);
                this.restore(this.history[this.history.length - 1]);
            }

            redo() {
                if(this.future.length === 0) return;
                const next = this.future.pop();
                this.history.push(next);
                this.restore(next);
            }

            setProcState(proc, newState) {
                proc.state = newState;
                if(proc.el) {
                    proc.el.className = `node ${proc.type} state-${newState.toLowerCase()}`;
                    const badge = proc.el.querySelector('.status-badge');
                    if(badge) badge.innerText = newState;
                }
                this.updateScheduler();
            }

            spawn(type, name, save = true) {
                const t = type || document.getElementById('spawnType').value;
                const n = name || `${t.toUpperCase()}_${this.pid}`;
                const p = { 
                    id: this.pid++, name: n, type: t, el: null, x:0, y:0,
                    state: 'READY' 
                };
                
                const el = document.createElement('div');
                el.className = `node ${t} state-ready`;
                el.innerHTML = `<span>${n}</span><div class="pid">PID:${p.id}</div><div class="status-badge">READY</div>`;
                this.space.appendChild(el);
                p.el = el;
                
                this.procs.push(p);
                this.placeNodes();
                this.updateUI();
                this.updateScheduler();
                this.log(`Spawned Process: ${n} (Ready Queue)`, 'sys');
                
                if(save) this.saveState();
            }

            kill() {
                const id = parseInt(document.getElementById('killSelect').value);
                if(!id) return;
                const target = this.procs.find(p => p.id === id);
                if(!target) return;

                if(target.type === 'root') {
                    // Unicode escape for shield emoji: \u{1F6E1}
                    this.err('\u{1F6E1}', `PERMISSION DENIED: Cannot kill ROOT (${target.name})`);
                    return;
                }

                this.anim('kernel', target, 'SIGKILL', 'skull', () => {
                    const ghost = target.el.cloneNode(true);
                    ghost.classList.add('ghost');
                    ghost.style.left = target.el.style.left;
                    ghost.style.top = target.el.style.top;
                    this.space.appendChild(ghost);
                    setTimeout(() => ghost.remove(), 600);

                    this.procs = this.procs.filter(p => p.id !== id);
                    if(target.el) target.el.remove();
                    
                    this.buffer = this.buffer.filter(m => m.to !== id && m.from !== id);

                    this.placeNodes();
                    this.renderBuf();
                    this.updateUI();
                    this.updateScheduler();
                    
                    this.log(`[SIGKILL] Terminated ${target.name}.`, 'err');
                    this.saveState();
                });
            }

            send() {
                const sId = parseInt(document.getElementById('senderSelect').value);
                const rId = parseInt(document.getElementById('receiverSelect').value);
                let payload = document.getElementById('payloadInput').value.trim() || "DATA";
                
                if(!sId || !rId) return;
                const s = this.procs.find(p => p.id === sId);
                const r = this.procs.find(p => p.id === rId);

                // Unicode escape for no-entry emoji: \u{26D4}
                if(s.id === r.id) { this.err('\u{26D4}', 'Loopback blocked'); return; }

                this.setProcState(s, 'RUNNING');
                this.anim(s, 'kernel', payload, 'normal', () => {
                    this.setProcState(s, 'READY'); 
                    const res = this.check(s, r);
                    
                    if(res === true) {
                        if(r.state === 'WAITING') {
                            this.log(`[INTERRUPT] Woke up ${r.name} from Wait Queue!`, 'sys');
                            this.setProcState(r, 'READY');
                            this.anim('kernel', r, payload, 'normal', () => {
                                this.log(`Delivered [${payload}] to ${r.name}`, 'ok');
                            });
                        } else {
                            this.buffer.push({from:sId, to:rId, payload: payload});
                            this.renderBuf();
                            this.log(`Buffered [${payload}] for ${r.name}`, 'ok');
                        }
                        this.saveState();
                    } else {
                        // Unicode escape for no-entry emoji: \u{26D4}
                        this.err('\u{26D4}', `Blocked: ${res}`);
                        this.setProcState(s, 'READY');
                    }
                });
            }

            read() {
                const sId = parseInt(document.getElementById('senderSelect').value);
                const rId = parseInt(document.getElementById('receiverSelect').value);
                if(!sId || !rId) return;

                // Unicode escape for no-entry emoji: \u{26D4}
                if(sId === rId) { this.err('\u{26D4}', 'Loopback blocked'); return; }

                const r = this.procs.find(p => p.id === rId);
                const idx = this.buffer.findIndex(m => m.to === rId && m.from === sId);

                this.setProcState(r, 'RUNNING');

                if(idx === -1) { 
                    setTimeout(() => {
                        this.setProcState(r, 'WAITING');
                        this.log(`[BLOCKED] ${r.name} enters Wait Queue...`, 'log-wait');
                        this.saveState(); 
                    }, 500);
                    return; 
                }

                const msg = this.buffer[idx];
                this.buffer.splice(idx, 1);
                this.renderBuf();
                
                this.anim('kernel', r, msg.payload, 'normal', () => {
                    this.log(`Received [${msg.payload}] by ${r.name}`, 'ok');
                    this.setProcState(r, 'READY');
                    this.saveState();
                });
            }

            updateScheduler() {
                this.qReadyUI.innerHTML = '';
                this.qRunUI.innerHTML = '';
                this.qWaitUI.innerHTML = '';

                this.procs.forEach(p => {
                    const item = `<div class="queue-item">${p.name}</div>`;
                    if(p.state === 'READY') this.qReadyUI.innerHTML += item;
                    else if(p.state === 'RUNNING') this.qRunUI.innerHTML += item;
                    else if(p.state === 'WAITING') this.qWaitUI.innerHTML += item;
                });
            }

            placeNodes() {
                // Center X remains the same
                const cx = this.space.clientWidth / 2; 
                // Center Y is shifted down by offset
                const cy = (this.space.clientHeight / 2) + this.offsetY; 
                
                // Apply offset to Kernel DOM element
                this.kernel.style.top = `calc(50% + ${this.offsetY}px)`;

                const r = 260;
                this.procs.forEach((p, i) => {
                    const angle = Math.PI + (Math.PI * (i + 1) / (this.procs.length + 1));
                    p.x = cx + Math.cos(angle) * r - 42;
                    p.y = cy + Math.sin(angle) * r * 0.6 - 42;
                    if(p.el) { p.el.style.left = `${p.x}px`; p.el.style.top = `${p.y}px`; }
                });
            }

            check(s, r) {
                if(s.id === r.id) return "Loopback Error";
                if(s.type === 'root') return true;
                if(s.type === 'guest') return r.type === 'guest' ? true : "Guest Restricted";
                if(s.type === 'user') return r.type === 'root' ? "Root Protected" : true;
                return true;
            }

            err(icon, msg) {
                const el = document.createElement('div');
                el.className = 'overlay-icon';
                el.innerHTML = icon;
                
                // Position the error icon exactly over the kernel, respecting offset
                const kRect = this.kernel.getBoundingClientRect();
                const sRect = this.space.getBoundingClientRect();
                
                // Calculate relative position
                const relTop = kRect.top - sRect.top + (kRect.height / 2);
                const relLeft = kRect.left - sRect.left + (kRect.width / 2);
                
                el.style.top = relTop + 'px';
                el.style.left = relLeft + 'px';
                
                this.space.appendChild(el);
                setTimeout(() => el.remove(), 1500); // Match animation length
                
                this.log(msg, 'err');
                let i = 0;
                const shake = setInterval(() => {
                    const off = (i++ % 2 === 0 ? 4 : -4);
                    this.kernel.style.transform = `translate(calc(-50% + ${off}px), -50%)`;
                    if(i > 6) { clearInterval(shake); this.kernel.style.transform = `translate(-50%, -50%)`; }
                }, 30);
            }

            renderBuf() {
                this.bufUI.innerHTML = '';
                if(this.buffer.length === 0) return;
                this.buffer.forEach(m => {
                    const s = this.procs.find(p => p.id === m.from);
                    const r = this.procs.find(p => p.id === m.to);
                    if(s && r) {
                        const d = document.createElement('div');
                        d.className = 'msg-item';
                        const color = r.type==='root'?'var(--color-root)':r.type==='user'?'var(--color-user)':'var(--color-guest)';
                        d.style.borderLeftColor = color;
                        d.innerHTML = `<span>${s.name}</span><span>➝</span><span class="msg-payload">${m.payload}</span><span>${r.name}</span>`;
                        this.bufUI.appendChild(d);
                    }
                });
            }

            anim(from, to, text, type='normal', cb) {
                const start = this.getPos(from);
                const end = this.getPos(to);
                const p = document.createElement('div');
                p.className = type === 'skull' ? 'packet skull' : 'packet';
                const disp = type === 'skull' ? 'SIGKILL' : (text.length>8 ? text.substring(0,6)+'..' : text);
                p.innerHTML = `<div class="packet-label" style="${type==='skull'?'border-color:red;color:red':''}">${disp}</div>`;
                this.space.appendChild(p);
                const t0 = performance.now();
                const step = (now) => {
                    const prog = Math.min((now - t0) / 800, 1);
                    const ease = prog < .5 ? 2 * prog * prog : -1 + (4 - 2 * prog) * prog;
                    const x = start.x + (end.x - start.x) * ease;
                    const y = start.y + (end.y - start.y) * ease;
                    p.style.left = (x - 6) + 'px';
                    p.style.top = (y - 6) + 'px';
                    if(prog < 1) requestAnimationFrame(step);
                    else { p.remove(); if(cb) cb(); }
                };
                requestAnimationFrame(step);
            }

            getPos(obj) {
                if(obj === 'kernel') {
                    // Since kernel is DOM-positioned, getRect is reliable
                    const r = this.kernel.getBoundingClientRect(); 
                    const s = this.space.getBoundingClientRect();
                    return { x: r.left - s.left + r.width/2, y: r.top - s.top + r.height/2 };
                } 
                // Nodes have their coordinates stored in x/y properties
                return { x: obj.x + 42, y: obj.y + 42 };
            }

            loop() {
                this.ctx.clearRect(0,0, this.canvas.width, this.canvas.height);
                const k = this.getPos('kernel');
                this.procs.forEach(p => {
                    const pc = this.getPos(p);
                    this.ctx.beginPath();
                    this.ctx.moveTo(k.x, k.y);
                    this.ctx.lineTo(pc.x, pc.y);
                    const grad = this.ctx.createLinearGradient(k.x, k.y, pc.x, pc.y);
                    grad.addColorStop(0, 'rgba(139, 92, 246, 0.5)');
                    grad.addColorStop(1, 'rgba(255,255,255,0.05)');
                    this.ctx.strokeStyle = grad;
                    this.ctx.lineWidth = 2;
                    this.ctx.stroke();
                });
                requestAnimationFrame(() => this.loop());
            }
            updateUI() {
                const s = document.getElementById('senderSelect');
                const r = document.getElementById('receiverSelect');
                const k = document.getElementById('killSelect');
                
                const sv = s.value, rv = r.value, kv = k.value;
                
                s.innerHTML = '<option value="">Sender...</option>'; 
                r.innerHTML = '<option value="">Receiver...</option>';
                k.innerHTML = '<option value="">Select PID...</option>';
                
                this.procs.forEach(p => {
                    const baseOpt = `<option value="${p.id}">${p.name} [${p.id}]</option>`;
                    s.innerHTML += baseOpt;
                    r.innerHTML += baseOpt;

                    if (p.type === 'root') {
                        // Soft Lock for Root
                        k.innerHTML += `<option value="${p.id}" style="color:var(--color-root); font-weight:bold;">${p.name} [${p.id}] 🔒</option>`;
                    } else {
                        k.innerHTML += baseOpt;
                    }
                });
                
                s.value = sv; r.value = rv; k.value = kv;
            }

            log(msg, type) {
                const c = type==='err'?'log-err':type==='ok'?'log-ok':type==='log-wait'?'log-wait':'log-sys';
                const t = new Date().toLocaleTimeString('en-US',{hour12:false});
                this.term.insertAdjacentHTML('beforeend', `<div class="log-entry ${c}"><span class="log-time">[${t}]</span> ${msg}</div>`);
                this.term.scrollTop = this.term.scrollHeight;
            }

            resize() {
                this.canvas.width = this.space.clientWidth;
                this.canvas.height = this.space.clientHeight;
                this.placeNodes();
            }
            reset() { location.reload(); }
        }

        const sim = new Sim();