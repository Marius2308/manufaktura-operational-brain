import csv
import random
from datetime import date, timedelta

random.seed(42)

# 30-day window ending the day before "today" (2026-07-03)
START = date(2026, 6, 3)
END = date(2026, 7, 2)
DAYS = [START + timedelta(days=i) for i in range((END - START).days + 1)]

# Canonical locations (this is the "clean" truth — each export below will
# refer to these using a DIFFERENT naming convention on purpose)
LOCATIONS = ["Baneasa", "Militari", "Vitan", "Cluj", "Timisoara"]

# Per-location behavior profile for the 30-day window
# base_sales: average weekday net sales in RON
# trend: overall drift over the month (fraction, applied linearly)
# story: short internal note on what's happening (not exported, just for us)
PROFILES = {
    "Baneasa":    dict(base_sales=19000, trend=+0.02, labor_pct=27, checklist=93, review_rating=4.5, story="flagship, stable, one weather blip"),
    "Militari":   dict(base_sales=14000, trend=+0.00, labor_pct=28, checklist=90, review_rating=4.2, story="temporary staffing gap weeks 2-3, resolved"),
    "Vitan":      dict(base_sales=13500, trend=-0.22, labor_pct=27, checklist=91, review_rating=4.3, story="declining all month, shift lead quit ~day 20, service complaints spike late month"),
    "Cluj":       dict(base_sales=11000, trend=+0.28, labor_pct=26, checklist=94, review_rating=4.6, story="new location ramping up fast, strong word of mouth"),
    "Timisoara":  dict(base_sales=15500, trend=+0.01, labor_pct=27, checklist=89, review_rating=4.1, story="steady, unremarkable baseline location"),
}

def weekday_multiplier(d):
    # Fri/Sat/Sun busier, Mon/Tue slower
    wd = d.weekday()  # 0=Mon
    return {0: 0.85, 1: 0.85, 2: 0.95, 3: 1.0, 4: 1.25, 5: 1.4, 6: 1.15}[wd]

def progress(d):
    return (d - START).days / (END - START).days  # 0.0 -> 1.0

# ---------------------------------------------------------------------------
# 1. SALES / POS EXPORT
#    - ALL CAPS location names with brand prefix (typical POS export quirk)
#    - date format DD.MM.YYYY
# ---------------------------------------------------------------------------
sales_rows = []
for loc in LOCATIONS:
    p = PROFILES[loc]
    for d in DAYS:
        prog = progress(d)
        drift = 1 + p["trend"] * prog
        # Vitan gets an extra sharp drop in the final 8 days (service problems compounding)
        if loc == "Vitan" and (END - d).days <= 8:
            drift *= 0.85
        noise = random.uniform(0.93, 1.07)
        net_sales = p["base_sales"] * weekday_multiplier(d) * drift * noise
        transactions = round(net_sales / random.uniform(58, 72))
        avg_check = round(net_sales / max(transactions, 1), 2)

        # One-off Baneasa weather blip
        if loc == "Baneasa" and d == date(2026, 6, 18):
            net_sales *= 0.55
            transactions = round(transactions * 0.55)

        pos_name = f"MANUFAKTURA {loc.upper()}"
        sales_rows.append([
            pos_name,
            d.strftime("%d.%m.%Y"),
            round(net_sales, 2),
            transactions,
            avg_check,
        ])

with open("/home/claude/sample-data/sales_pos_export.csv", "w", newline="", encoding="utf-8") as f:
    w = csv.writer(f)
    w.writerow(["Location", "Date", "Net_Sales_RON", "Transactions", "Avg_Check_RON"])
    w.writerows(sales_rows)

# ---------------------------------------------------------------------------
# 2. PAYROLL / FTE EXPORT
#    - short city-name-only location labels (no brand prefix)
#    - weekly cycle, date format MM/DD/YYYY (US-style, common payroll software quirk)
# ---------------------------------------------------------------------------
week_endings = [date(2026, 6, 7), date(2026, 6, 14), date(2026, 6, 21), date(2026, 6, 28), date(2026, 7, 5)]
payroll_rows = []
for loc in LOCATIONS:
    p = PROFILES[loc]
    for i, we in enumerate(week_endings):
        base_hours = 620 if loc in ("Baneasa",) else 480 if loc == "Cluj" else 540
        scheduled = base_hours * random.uniform(0.97, 1.03)
        labor_pct = p["labor_pct"]

        if loc == "Militari" and i in (1, 2):  # staffing gap weeks 2-3 -> overtime spike
            labor_pct += 5.5
            actual = scheduled * 1.14
        elif loc == "Vitan" and i >= 2:  # short-staffed after shift lead left, then overtime to compensate
            labor_pct += 3.5 + (i - 2) * 1.5
            actual = scheduled * (1.05 + 0.03 * (i - 2))
        else:
            actual = scheduled * random.uniform(0.98, 1.04)

        # crude weekly sales estimate for labor % calc consistency
        weekly_sales_est = PROFILES[loc]["base_sales"] * 7 * (1 + p["trend"] * (i / len(week_endings)))
        labor_cost = round(weekly_sales_est * (labor_pct / 100), 2)
        fte_count = round(actual / 40, 1)

        payroll_rows.append([
            loc,  # plain city name only
            we.strftime("%m/%d/%Y"),
            round(scheduled, 1),
            round(actual, 1),
            labor_cost,
            fte_count,
        ])

with open("/home/claude/sample-data/payroll_fte_export.csv", "w", newline="", encoding="utf-8") as f:
    w = csv.writer(f)
    w.writerow(["Store", "Week_Ending", "Scheduled_Hours", "Actual_Hours", "Labor_Cost_RON", "FTE_Count"])
    w.writerows(payroll_rows)

# ---------------------------------------------------------------------------
# 3. JOLT / CHECKLIST EXPORT
#    - "Manufaktura - <City>" naming (dash-separated, yet another convention)
#    - date format YYYY-MM-DD
#    - audits roughly twice a week
# ---------------------------------------------------------------------------
audit_dates = [d for d in DAYS if d.weekday() in (1, 4)]  # Tue & Fri
checklist_rows = []
for loc in LOCATIONS:
    p = PROFILES[loc]
    for i, d in enumerate(audit_dates):
        score = p["checklist"] + random.uniform(-3, 3)
        if loc == "Vitan" and (END - d).days <= 10:
            score -= random.uniform(15, 25)  # sharp compliance drop late month
        score = max(min(score, 100), 40)
        items_failed = round((100 - score) / 6)
        checklist_rows.append([
            f"Manufaktura - {loc}",
            d.strftime("%Y-%m-%d"),
            "Daily Operations Checklist",
            round(score, 1),
            items_failed,
        ])

with open("/home/claude/sample-data/jolt_checklist_export.csv", "w", newline="", encoding="utf-8") as f:
    w = csv.writer(f)
    w.writerow(["Site", "Audit_Date", "Checklist_Name", "Score_Percent", "Items_Failed"])
    w.writerows(checklist_rows)

# ---------------------------------------------------------------------------
# 4. GUEST REVIEWS / COMPLAINTS EXPORT
#    - "MNK <City>" abbreviation (yet another naming convention)
#    - date format "3 Jun 2026" (text month, common review-platform export quirk)
# ---------------------------------------------------------------------------
POSITIVE_SNIPPETS = [
    "Great food and fast service, will come back.",
    "Loved the atmosphere, staff was very friendly.",
    "Best burger I've had in the city.",
    "Clean place, quick table turnaround, good value.",
    "Consistently good experience every time we visit.",
]
NEGATIVE_SNIPPETS_GENERIC = [
    "Food was cold when it arrived.",
    "Order was wrong and had to send it back.",
    "A bit overpriced for the portion size.",
]
NEGATIVE_SNIPPETS_SERVICE = [
    "Waited over 40 minutes for our food, staff seemed overwhelmed.",
    "Asked for the bill three times before anyone came.",
    "Service was really slow, felt understaffed.",
    "Rude waiter, didn't check on us the whole meal.",
    "Took forever to even get water at the table.",
]
PLATFORMS = ["Google", "TripAdvisor", "Facebook"]

review_rows = []
for loc in LOCATIONS:
    p = PROFILES[loc]
    n_reviews = random.randint(6, 10)
    review_days = sorted(random.sample(DAYS, n_reviews))
    service_pool = NEGATIVE_SNIPPETS_SERVICE.copy()
    random.shuffle(service_pool)
    for d in review_days:
        is_late_vitan_window = (loc == "Vitan" and (END - d).days <= 12)
        if is_late_vitan_window:
            rating = random.choice([1, 2, 2, 3])
            if not service_pool:
                service_pool = NEGATIVE_SNIPPETS_SERVICE.copy()
                random.shuffle(service_pool)
            text = service_pool.pop()
        else:
            roll = random.random()
            base_rating = p["review_rating"]
            if roll < 0.75:
                rating = 5 if base_rating >= 4.4 else random.choice([4, 5])
                text = random.choice(POSITIVE_SNIPPETS)
            elif roll < 0.92:
                rating = 4
                text = random.choice(POSITIVE_SNIPPETS)
            else:
                rating = random.choice([2, 3])
                text = random.choice(NEGATIVE_SNIPPETS_GENERIC)

        review_rows.append([
            f"MNK {loc}",
            d.strftime("%-d %b %Y") if hasattr(d, "strftime") else d.isoformat(),
            random.choice(PLATFORMS),
            rating,
            text,
        ])

with open("/home/claude/sample-data/guest_reviews_export.csv", "w", newline="", encoding="utf-8") as f:
    w = csv.writer(f)
    w.writerow(["Location", "Review_Date", "Platform", "Rating", "Review_Text"])
    w.writerows(review_rows)

# ---------------------------------------------------------------------------
# 5. MANAGER NOTES
#    - plain city names, date format DD/MM/YYYY (European short format)
#    - sparse, free-text, human-entered
# ---------------------------------------------------------------------------
notes = [
    ("Vitan", date(2026, 6, 19), "M. Popescu", "Shift lead Andreea resigned effective immediately, no replacement lined up yet."),
    ("Vitan", date(2026, 6, 24), "M. Popescu", "Running short-staffed on weekend dinner shifts, pulled two people from Militari to cover."),
    ("Vitan", date(2026, 6, 29), "R. Ionescu", "Guest complained in person about 45 min wait, comped the meal. Kitchen says they're behind on prep."),
    ("Militari", date(2026, 6, 10), "A. Dumitrescu", "Two line cooks out sick same week, covering with overtime until new hires start training."),
    ("Militari", date(2026, 6, 23), "A. Dumitrescu", "New hires fully trained and on schedule now, overtime should normalize next week."),
    ("Baneasa", date(2026, 6, 18), "L. Stan", "Sudden storm mid-afternoon, terrace closed for 3 hours, lost a big chunk of walk-in traffic."),
    ("Baneasa", date(2026, 6, 27), "L. Stan", "Hosted a 40-person private event Friday night, went smoothly, good upsell on drinks package."),
    ("Cluj", date(2026, 6, 14), "T. Marin", "Local food blogger post is driving a lot of new walk-ins, might need to adjust weekend staffing up."),
    ("Cluj", date(2026, 6, 30), "T. Marin", "Increased weekend staffing per last note's suggestion, seems to be handling the extra volume fine."),
    ("Timisoara", date(2026, 6, 20), "D. Vasile", "Nothing unusual this week, business as normal."),
]

with open("/home/claude/sample-data/manager_notes.csv", "w", newline="", encoding="utf-8") as f:
    w = csv.writer(f)
    w.writerow(["Location", "Note_Date", "Author", "Note"])
    for loc, d, author, note in notes:
        w.writerow([loc, d.strftime("%d/%m/%Y"), author, note])

print("Done. Files written to /home/claude/sample-data/")
for fn in ["sales_pos_export.csv", "payroll_fte_export.csv", "jolt_checklist_export.csv", "guest_reviews_export.csv", "manager_notes.csv"]:
    with open(f"/home/claude/sample-data/{fn}") as f:
        n = sum(1 for _ in f) - 1
    print(f"  {fn}: {n} rows")
