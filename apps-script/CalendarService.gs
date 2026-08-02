function getManagedCalendar_() {
  var id = PropertiesService.getScriptProperties().getProperty("GOOGLE_CALENDAR_ID");
  if (!id) throw sbError_("CALENDAR_NOT_CONFIGURED", "GOOGLE_CALENDAR_ID belum diatur.", 503);
  var calendar = CalendarApp.getCalendarById(id);
  if (!calendar) throw sbError_("CALENDAR_NOT_FOUND", "Kalender Saldo Bersama tidak ditemukan.", 404);
  return calendar;
}

function eventDate_(value) {
  var date = new Date(String(value) + "T09:00:00+07:00");
  if (isNaN(date.getTime())) throw sbError_("CALENDAR_DATE_INVALID", "Tanggal event tidak valid.", 400);
  return date;
}

function rebuildCalendar_(payload) {
  var calendar = getManagedCalendar_();
  var items = Array.isArray(payload.items) ? payload.items : [];
  if (items.length > 1000) throw sbError_("CALENDAR_BATCH_TOO_LARGE", "Batch Calendar terlalu besar.", 413);
  var wanted = {};
  items.forEach(function(item) { wanted[String(item.entityId || "")] = item; });
  var rangeStart = new Date(); rangeStart.setMonth(rangeStart.getMonth() - 2);
  var rangeEnd = new Date(); rangeEnd.setFullYear(rangeEnd.getFullYear() + 2);
  var existing = {};
  calendar.getEvents(rangeStart, rangeEnd).forEach(function(event) {
    try {
      if (event.getTag("saldo_bersama_managed") === "true") existing[event.getTag("saldo_bersama_entity_id")] = event;
    } catch (ignored) {}
  });
  var created = 0; var updated = 0; var removed = 0;
  Object.keys(wanted).forEach(function(entityId) {
    if (!entityId) return;
    var item = wanted[entityId];
    var start = eventDate_(item.date); var end = new Date(start.getTime() + 30 * 60000);
    var event = existing[entityId];
    if (event) { event.setTitle(cleanText_(item.title, 120)); event.setTime(start, end); event.setDescription(cleanText_(item.description, 500)); updated += 1; delete existing[entityId]; }
    else { event = calendar.createEvent(cleanText_(item.title, 120), start, end, { description: cleanText_(item.description, 500) }); created += 1; }
    event.setTag("saldo_bersama_managed", "true");
    event.setTag("saldo_bersama_entity_id", entityId);
  });
  Object.keys(existing).forEach(function(entityId) { try { existing[entityId].deleteEvent(); removed += 1; } catch (ignored) {} });
  return { created: created, updated: updated, removed: removed, syncedAt: new Date().toISOString() };
}
