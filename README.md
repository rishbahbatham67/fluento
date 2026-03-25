# Fluento

AI-powered speaking practice built for real goals — not generic vocabulary.

Most language apps teach random words. Fluento focuses on **what you actually need** based on your goal:
- Software engineering interviews → scalable, tradeoffs, iteration  
- IELTS → academic vocabulary  
- Business English → negotiation, leadership  

---

## 🚀 What is Fluento?

Fluento is a full-stack AI speaking coach that combines:
- Goal-based vocabulary generation  
- Real-time speaking practice  
- AI-powered feedback and correction  

---

## ✨ Features

### 🎯 Goal-Based Vocabulary Engine
- Set your goal (interviews, IELTS, business, etc.)
- AI generates unique, non-repetitive word sets
- Each word includes:
  - Meaning  
  - Contextual example  
- Record your own sentence
- Get instant AI feedback:
  - Fluency  
  - Grammar  
  - Correct usage  

---

### 📖 Reading Mode (Speaking + Speed Control)
- AI-generated paragraph based on difficulty
- Two cursors:
  - Live cursor → tracks your speech in real time  
  - Target cursor → moves at desired WPM  
- Skip words naturally → system detects and marks them  
- Post-session analytics:
  - Accuracy %
  - WPM vs target
  - Missed words
  - Color-coded breakdown  

---

### 🎙️ Full Speaking Evaluation Pipeline
- AI-generated topics tailored to your goal  
- Structure hints + vocabulary suggestions  
- Timer-based speaking practice  

Output includes:
- Overall score  
- Fluency, grammar, vocabulary, clarity, pacing  
- Exact corrections + rewritten version  
- Strengths + improvement areas  

End-to-end processing in under ~20 seconds  

---

## 🧠 How it Works (Pipeline)
\
Audio Input\
↓\
FastAPI Endpoint\
↓\
faster-whisper (local transcription)\
↓\
Groq API → LLaMA 3.3 70B\
↓\
Structured JSON (scores, corrections, rewrite)


- Zero external transcription cost  
- Low latency  
- Structured AI output  

---

## ⚙️ Tech Stack

### Frontend
- Next.js 16  
- TypeScript  
- Framer Motion  

### Backend
- FastAPI  
- Python  
- SQLAlchemy  
- SQLite  

### AI / ML
- faster-whisper (local speech-to-text)  
- Groq API  
- LLaMA 3.3 70B  
- Prompt engineering for structured outputs  

---

## 🧩 Engineering Highlights

- Goal-aware vocabulary generation (no repetition)
- Structured LLM outputs (JSON scoring + corrections)
- Real-time speech tracking with cursor sync
- Monotonic cursor system to prevent reset issues
- 8-word lookahead algorithm for skip detection
- Separation of interim vs final speech recognition results

---


## 💡 Philosophy

Language learning should be contextual, goal-driven, and feedback-rich — not random memorization.

---

## 👨‍💻 Author

Rishabh Batham
