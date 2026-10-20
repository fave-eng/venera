window.APP_CONFIG = Object.freeze({
  student: Object.freeze({
    id: "venera",
    nameRu: "Венера",
    nameEn: "Venera",
    level: "A1",
    textbook: "English File",
    textbookEdition: "B1"
  }),
  supabase: Object.freeze({
    url: "https://zqzgarvmpqqqaobeicpc.supabase.co",
    anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpxemdhcnZtcHFxcWFvYmVpY3BjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2ODQwNTIsImV4cCI6MjA5NzI2MDA1Mn0.gARetYwVZfInx3QKS0RvB2I5cOwegPMY5q3nJPX4ZP8",
    notificationFunction: "notify-venera-telegram",
    authMode: "password",
    tables: {
      homework: "homework_progress",
      vocabulary: "vocabulary_progress",
      vocabularyTopics: "vocabulary_topic_progress",
      grammar: "grammar_progress"
    }
  }),
  features: Object.freeze({
    homework: true,
    grammar: true,
    vocabulary: true,
    cloudSync: true,
    wordPronunciation: true,
    telegramNotifications: true
  })
});
