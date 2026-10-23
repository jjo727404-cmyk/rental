// ==========================================================
// RIVO RENTALS - SUPABASE INTEGRATION CLIENT (ZERO DEPENDENCY)
// ==========================================================

const DEFAULT_SUPABASE_URL = "https://jdfihsgiltonwuqqxvax.supabase.co";
const DEFAULT_SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpkZmloc2dpbHRvbnd1cXF4dmF4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI1OTQ2NjAsImV4cCI6MjEwODE3MDY2MH0.0Vb5dlNMZWy0Vbm50-IpSJ3yTrTLwAerszUFVU8aHU8";

(function () {
  const STORAGE_KEY_URL = "rivo_sb_url";
  const STORAGE_KEY_KEY = "rivo_sb_key";

  function getCredentials() {
    const url = localStorage.getItem(STORAGE_KEY_URL) || DEFAULT_SUPABASE_URL || "";
    const key = localStorage.getItem(STORAGE_KEY_KEY) || DEFAULT_SUPABASE_ANON_KEY || "";
    return { url: url.trim(), key: key.trim() };
  }

  async function sbFetch(path, options = {}) {
    const { url, key } = getCredentials();
    if (!url || !key) throw new Error("Missing Supabase URL or Anon Key");
    const endpoint = url.replace(/\/+$/, "") + path;
    const headers = {
      "apikey": key,
      "Authorization": "Bearer " + key,
      "Content-Type": "application/json",
      ...(options.headers || {})
    };
    return fetch(endpoint, { ...options, headers });
  }

  function updateStatusBadge(connected) {
    document.querySelectorAll(".sb-status-badge").forEach((badge) => {
      if (connected) {
        badge.innerHTML = `<span class="sb-dot connected"></span> Supabase Connected`;
        badge.classList.add("is-connected");
        badge.title = "Connected to Supabase Cloud Database";
      } else {
        badge.innerHTML = `<span class="sb-dot disconnected"></span> Connect Supabase`;
        badge.classList.remove("is-connected");
        badge.title = "Click to configure Supabase credentials";
      }
    });
  }

  function safeIso(val, offsetMs = 0) {
    try {
      if (val) {
        const d = new Date(val);
        if (!isNaN(d.getTime())) return d.toISOString();
      }
    } catch (e) {}
    return new Date(Date.now() + offsetMs).toISOString();
  }

  const RivoDB = {
    getCredentials,

    isConfigured() {
      const { url, key } = getCredentials();
      return Boolean(url && key);
    },

    setCredentials(url, key) {
      if (url) localStorage.setItem(STORAGE_KEY_URL, url.trim());
      else localStorage.removeItem(STORAGE_KEY_URL);

      if (key) localStorage.setItem(STORAGE_KEY_KEY, key.trim());
      else localStorage.removeItem(STORAGE_KEY_KEY);

      updateStatusBadge(this.isConfigured());
      return this.isConfigured();
    },

    async testConnection() {
      const { url, key } = getCredentials();
      if (!url || !key) return { success: false, error: "Please enter your Project URL and Anon Key." };
      try {
        const res = await sbFetch("/rest/v1/bookings?select=id&limit=1");
        if (!res.ok) {
          const txt = await res.text();
          return { success: false, error: `HTTP ${res.status}: ${txt}` };
        }
        return { success: true };
      } catch (e) {
        return {
          success: false,
          error: `${e.message}. If using Brave Browser, click the Lion shield icon and turn Shields DOWN for local files.`
        };
      }
    },

    // Save a booking to Supabase
    async saveBooking(b, silent = false) {
      const { url, key } = getCredentials();
      if (!url || !key) {
        if (!silent) alert("Supabase Notice: Please configure your Supabase credentials.");
        return { error: "No credentials" };
      }

      const row = {
        booking_id: b.bookingId || b.id || "RIV-" + Math.floor(10000 + Math.random() * 90000),
        veh_name: b.vehName || b.veh || "Vehicle",
        category: b.cat || "car",
        days: parseInt(b.days, 10) || 1,
        pickup_hub: b.loc || b.hub || "Kochi Hub",
        pickup_datetime: safeIso(b.at || b.pickup_datetime),
        return_datetime: safeIso(b.returnAt || b.return_datetime, (b.days || 1) * 86400000),
        base_price: parseFloat(b.basePrice || b.p || b.totalAmount || b.total || 0),
        delivery_fee: parseFloat(b.deliveryFee || 0),
        insurance_fee: parseFloat(b.insFee || 0),
        extra_services: parseFloat(b.extraCost || 0),
        has_driver: Boolean(b.hasDriver),
        driver_cost: parseFloat(b.driverCost || 0),
        total_amount: parseFloat(b.totalAmount || b.total || b.tot || 0),
        advance_paid: parseFloat(b.advPaid || b.advance || 0),
        balance_due: parseFloat(b.balDue || b.balance || 0),
        customer_name: b.name || "Customer",
        customer_phone: b.phone || "",
        customer_email: b.email || "",
        license_no: b.lic || "",
        license_doc: b.licenseDoc || b.license_doc || "",
        id_doc: b.idDoc || b.id_doc || "",
        status: b.status || "Confirmed"
      };

      try {
        const res = await sbFetch("/rest/v1/bookings", {
          method: "POST",
          headers: { "Prefer": "return=minimal" },
          body: JSON.stringify(row)
        });

        if (!res.ok) {
          const errText = await res.text();
          // Fallback if license_doc or id_doc columns don't exist yet in Supabase
          if (errText.includes("license_doc") || errText.includes("id_doc")) {
            console.warn("Supabase bookings table missing doc columns. Retrying without them...");
            const fallbackRow = { ...row };
            delete fallbackRow.license_doc;
            delete fallbackRow.id_doc;
            const retryRes = await sbFetch("/rest/v1/bookings", {
              method: "POST",
              headers: { "Prefer": "return=minimal" },
              body: JSON.stringify(fallbackRow)
            });
            if (retryRes.ok) {
              console.log("✅ Booking saved to Supabase (without doc columns):", row.booking_id);
              return { data: fallbackRow };
            }
          }
          console.error("Supabase booking insert error:", res.status, errText);
          if (!silent) {
            alert(`⚠️ Supabase Error (HTTP ${res.status}):\n${errText}`);
          }
          return { error: errText };
        }

        console.log("✅ Booking successfully saved to Supabase:", row.booking_id);
        if (!silent) {
          console.info("Saved to Supabase:", row);
        }
        return { data: row };
      } catch (err) {
        console.error("Supabase network error:", err);
        if (!silent) {
          alert(`⚠️ Network / Browser restriction: ${err.message}\n\n👉 If using Brave Browser, click the orange Lion Shield icon next to the address bar and switch Shields to OFF for local file URLs.`);
        }
        return { error: err.message };
      }
    },

    // Sync all existing local bookings to Supabase
    async syncLocalBookings(silent = true) {
      const { url, key } = getCredentials();
      if (!url || !key) return 0;
      try {
        const raw = localStorage.getItem("rivo_bk");
        if (!raw) return 0;
        const list = JSON.parse(raw);
        if (!Array.isArray(list) || !list.length) return 0;
        let count = 0;
        for (const b of list) {
          const res = await this.saveBooking(b, true);
          if (res && !res.error) count++;
        }
        if (count > 0 && !silent) {
          alert(`✅ Synced ${count} bookings to Supabase!`);
        }
        return count;
      } catch (e) {
        console.warn("Could not sync local bookings:", e);
        return 0;
      }
    },

    // Save a breakdown ticket to Supabase
    async saveTicket(t) {
      const row = {
        ticket_id: t.id || "TKT-" + Date.now(),
        vehicle: t.veh || "",
        issue: t.issue || "",
        phone: t.phone || "",
        location: t.loc || "",
        notes: t.note || "",
        is_urgent: Boolean(t.urg),
        status: "Ticket raised"
      };
      try {
        const res = await sbFetch("/rest/v1/tickets", {
          method: "POST",
          headers: { "Prefer": "return=minimal" },
          body: JSON.stringify(row)
        });
        return res.ok ? { data: row } : { error: await res.text() };
      } catch (err) {
        return { error: err.message };
      }
    },

    // Fetch reviews from Supabase
    async getReviews() {
      try {
        const res = await sbFetch("/rest/v1/reviews?select=*&order=created_at.desc&limit=20");
        if (!res.ok) return [];
        return await res.json();
      } catch (err) {
        return [];
      }
    },

    // Sync all existing local reviews to Supabase
    async syncLocalReviews() {
      const { url, key } = getCredentials();
      if (!url || !key) return 0;
      try {
        const raw = localStorage.getItem("rivo_rv");
        if (!raw) return 0;
        const list = JSON.parse(raw);
        if (!Array.isArray(list) || !list.length) return 0;
        let count = 0;
        for (const r of list) {
          const res = await this.saveReview(r);
          if (res && !res.error) count++;
        }
        return count;
      } catch (e) {
        return 0;
      }
    },

    // Save a new customer review to Supabase
    async saveReview(r) {
      const row = {
        name: r.name || r.n || "Rider",
        text: r.text || r.t || "",
        stars: parseInt(r.stars || r.s || 5, 10)
      };
      try {
        const res = await sbFetch("/rest/v1/reviews", {
          method: "POST",
          headers: { "Prefer": "return=minimal" },
          body: JSON.stringify(row)
        });
        return res.ok ? { data: row } : { error: await res.text() };
      } catch (err) {
        return { error: err.message };
      }
    },

    // Fetch bookings for Admin dashboard
    async getBookings() {
      try {
        const res = await sbFetch("/rest/v1/bookings?select=*&order=id.desc&limit=100");
        if (!res.ok) return [];
        return await res.json();
      } catch (err) {
        console.error("Failed to load bookings:", err);
        return [];
      }
    },

    // Fetch tickets for Admin dashboard
    async getTickets() {
      try {
        const res = await sbFetch("/rest/v1/tickets?select=*&order=id.desc&limit=100");
        if (!res.ok) return [];
        return await res.json();
      } catch (err) {
        console.error("Failed to load tickets:", err);
        return [];
      }
    },

    // Update ticket status
    async updateTicketStatus(ticketId, status) {
      try {
        const res = await sbFetch(`/rest/v1/tickets?ticket_id=eq.${encodeURIComponent(ticketId)}`, {
          method: "PATCH",
          headers: { "Prefer": "return=minimal" },
          body: JSON.stringify({ status })
        });
        return res.ok;
      } catch (err) {
        return false;
      }
    },

    // Open Supabase Setup Dialog
    openSetupModal() {
      const creds = getCredentials();
      const existing = document.getElementById("sbConfigModal");
      if (existing) existing.remove();

      const modalHtml = `
        <div id="sbConfigModal" class="sb-modal-backdrop" onclick="if(event.target===this)this.remove()">
          <div class="sb-modal-card">
            <div class="sb-modal-header">
              <div style="display:flex;align-items:center;gap:10px">
                <span class="sb-icon">⚡</span>
                <h3 style="margin:0;font-size:1.2rem;font-family:Sora,sans-serif">Supabase Cloud Database</h3>
              </div>
              <button type="button" class="sb-close-btn" onclick="document.getElementById('sbConfigModal').remove()">&times;</button>
            </div>
            
            <p style="font-size:0.86rem;color:var(--muted);margin:10px 0 16px;line-height:1.5">
              Connect your Supabase PostgreSQL database to save bookings, roadside tickets, and reviews in real time.
            </p>

            <form id="sbForm" onsubmit="return false;">
              <div style="margin-bottom:12px">
                <label style="font-size:.78rem;font-weight:600;display:block;margin-bottom:4px">Project URL</label>
                <input type="text" id="sbUrl" placeholder="https://xyzcompany.supabase.co" value="${creds.url}"
                  style="width:100%;padding:10px 12px;border-radius:10px;border:1.5px solid var(--line);background:var(--bg);color:var(--ink);font-size:.88rem">
              </div>

              <div style="margin-bottom:16px">
                <label style="font-size:.78rem;font-weight:600;display:block;margin-bottom:4px">Anon Public API Key</label>
                <input type="text" id="sbKey" placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6..." value="${creds.key}"
                  style="width:100%;padding:10px 12px;border-radius:10px;border:1.5px solid var(--line);background:var(--bg);color:var(--ink);font-size:.88rem">
              </div>

              <div id="sbMsg" style="display:none;padding:10px 12px;border-radius:10px;font-size:.82rem;margin-bottom:14px"></div>

              <div style="display:flex;gap:10px;flex-wrap:wrap">
                <button type="button" id="sbSaveBtn" class="btn" style="flex:1;padding:11px 18px">Test &amp; Save</button>
              </div>

              <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-top:8px">
                <button type="button" id="sbTestInsertBtn" class="btn" style="background:#10b981;padding:9px 6px;font-size:.78rem">🚗 Test Booking</button>
                <button type="button" id="sbTestTicketBtn" class="btn" style="background:#d63f4f;color:#fff;padding:9px 6px;font-size:.78rem">🛠️ Test Ticket</button>
                <button type="button" id="sbTestReviewBtn" class="btn alt" style="padding:9px 6px;font-size:.78rem">⭐ Test Review</button>
              </div>

              <button type="button" id="sbSyncBtn" class="btn alt" style="width:100%;margin-top:10px;padding:9px 12px;font-size:.82rem">🔄 Push Saved Bookings &amp; Reviews to Supabase</button>
            </form>

            <div style="margin-top:16px;padding-top:14px;border-top:1px dashed var(--line);font-size:.78rem;color:var(--muted)">
              <b>🛡️ Using Brave Browser?</b><br>
              If requests fail on <code style="background:var(--soft);padding:1px 4px;border-radius:3px">file:///</code>, click the Brave Lion Shield icon next to the address bar and switch Shields to <b>OFF</b> for local files.
            </div>
          </div>
        </div>
      `;

      document.body.insertAdjacentHTML("beforeend", modalHtml);

      const msgEl = document.getElementById("sbMsg");
      const saveBtn = document.getElementById("sbSaveBtn");
      const testInsertBtn = document.getElementById("sbTestInsertBtn");
      const syncBtn = document.getElementById("sbSyncBtn");

      saveBtn.onclick = async () => {
        const u = document.getElementById("sbUrl").value.trim();
        const k = document.getElementById("sbKey").value.trim();
        saveBtn.disabled = true;
        saveBtn.textContent = "Testing...";
        RivoDB.setCredentials(u, k);

        const res = await RivoDB.testConnection();
        saveBtn.disabled = false;
        saveBtn.textContent = "Test & Save";

        msgEl.style.display = "block";
        if (res.success) {
          msgEl.style.background = "#dcfce7";
          msgEl.style.color = "#166534";
          msgEl.textContent = "✅ Successfully reached Supabase! Database is ready.";
        } else {
          msgEl.style.background = "#fee2e2";
          msgEl.style.color = "#991b1b";
          msgEl.textContent = "❌ " + res.error;
        }
      };

      testInsertBtn.onclick = async () => {
        testInsertBtn.disabled = true;
        testInsertBtn.textContent = "Inserting...";
        const sampleBooking = {
          bookingId: "TEST-" + Math.floor(1000 + Math.random() * 9000),
          vehName: "Maruti Suzuki Swift",
          cat: "car",
          days: 2,
          loc: "Kochi Airport Hub",
          basePrice: 3500,
          totalAmount: 3500,
          advPaid: 350,
          balDue: 3150,
          name: "Test Rider",
          phone: "9876543210",
          email: "test@rivorentals.com",
          lic: "KL-07-20230009999",
          status: "Confirmed"
        };
        const res = await RivoDB.saveBooking(sampleBooking, true);
        testInsertBtn.disabled = false;
        testInsertBtn.textContent = "🚀 Test Booking Insert";
        msgEl.style.display = "block";
        if (res && res.data) {
          msgEl.style.background = "#dcfce7";
          msgEl.style.color = "#166534";
          msgEl.textContent = `🎉 Success! Created test booking ${sampleBooking.bookingId} in your Supabase table! Refresh your Supabase Table Editor now.`;
        } else {
          msgEl.style.background = "#fee2e2";
          msgEl.style.color = "#991b1b";
          msgEl.textContent = "❌ Insert failed: " + (res ? res.error : "Unknown error");
        }
      };

      if (syncBtn) {
        syncBtn.onclick = async () => {
          syncBtn.disabled = true;
          syncBtn.textContent = "Syncing...";
          const count = await RivoDB.syncLocalBookings(false);
          syncBtn.disabled = false;
          syncBtn.textContent = `🔄 Push Saved Bookings (${count} synced)`;
        };
      }

      const testTicketBtn = document.getElementById("sbTestTicketBtn");
      if (testTicketBtn) {
        testTicketBtn.onclick = async () => {
          testTicketBtn.disabled = true;
          testTicketBtn.textContent = "Inserting...";
          const sample = {
            id: "TKT-" + Math.floor(1000 + Math.random() * 9000),
            veh: "Royal Enfield Himalayan",
            issue: "Flat tyre / puncture",
            phone: "9876543210",
            loc: "Munnar Tea Trail, Km 18",
            note: "Rider waiting at roadside tea stall.",
            urg: false
          };
          const res = await RivoDB.saveTicket(sample);
          testTicketBtn.disabled = false;
          testTicketBtn.textContent = "🛠️ Test Ticket";
          msgEl.style.display = "block";
          if (res && res.data) {
            msgEl.style.background = "#dcfce7";
            msgEl.style.color = "#166534";
            msgEl.textContent = `🎉 Success! Created ticket ${sample.id} in your Supabase 'tickets' table! Refresh your Supabase table to view it.`;
          } else {
            msgEl.style.background = "#fee2e2";
            msgEl.style.color = "#991b1b";
            msgEl.textContent = "❌ Insert failed: " + (res ? res.error : "Unknown error");
          }
        };
      }

      const testReviewBtn = document.getElementById("sbTestReviewBtn");
      if (testReviewBtn) {
        testReviewBtn.onclick = async () => {
          testReviewBtn.disabled = true;
          testReviewBtn.textContent = "Inserting...";
          const sample = {
            name: "Rahul Menon",
            text: "Amazing road trip to Munnar with Rivo rentals! Super clean car.",
            stars: 5
          };
          const res = await RivoDB.saveReview(sample);
          testReviewBtn.disabled = false;
          testReviewBtn.textContent = "⭐ Test Review Insert";
          msgEl.style.display = "block";
          if (res && res.data) {
            msgEl.style.background = "#dcfce7";
            msgEl.style.color = "#166534";
            msgEl.textContent = `🎉 Success! Created review in your Supabase 'reviews' table! Refresh your Supabase table to view it.`;
          } else {
            msgEl.style.background = "#fee2e2";
            msgEl.style.color = "#991b1b";
            msgEl.textContent = "❌ Insert failed: " + (res ? res.error : "Unknown error");
          }
        };
      }
    }
  };

  window.RivoDB = RivoDB;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      updateStatusBadge(RivoDB.isConfigured());
      setTimeout(() => {
        RivoDB.syncLocalBookings(true);
        RivoDB.syncLocalReviews(true);
      }, 1200);
    });
  } else {
    updateStatusBadge(RivoDB.isConfigured());
    setTimeout(() => {
      RivoDB.syncLocalBookings(true);
      RivoDB.syncLocalReviews(true);
    }, 1200);
  }
})();
