<!-- put this in /config.js -->
<script>
  window.SUPABASE_URL  = "https://qddjhayaqkdcxqgdriav.supabase.co"; // your project url
  window.SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFkZGpoYXlhcWtkY3hxZ2RyaWF2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIyODEzMzUsImV4cCI6MjA3Nzg1NzMzNX0.Z_w3O9z6ZdZKt1TS3p4e6YYeUl1XHlCohLAatbA7g2U";
</script>
<script src="https://unpkg.com/@supabase/supabase-js@2"></script>
<script>
  window.supabase = supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON);
</script>