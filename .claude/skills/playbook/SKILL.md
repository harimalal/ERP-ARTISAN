---
name: playbook
description: Session Management & Auto-Logging for ALL projects. Use this at the START of every work session to pick a project and understand where you left off. Claude will automatically log everything at the END of the session—no manual work needed. Works for PLAYBOOK_IA projects, Claude improvements, skill creation, and any long-running work. Triggers when you're starting work or want to resume a project.
---

# 🚀 SKILL: /playbook

**Automated session management and logging — use at START and END of every session**

---

## 🎯 What This Skill Does

### At START of Session
Claude will:
1. 📋 **Show available projects** (PLAYBOOK_IA, improvements, skills, etc.)
2. 🎯 **You choose** which one to work on
3. 📖 **Claude reads** SESSION_LOG.md (if exists)
4. ❓ **Claude asks:** "Continue from here? Start something new? What's on the agenda?"
5. ✅ **You confirm** → Work starts

### At END of Session
Claude will **automatically**:
1. 📝 **Create/update** SESSION_LOG.md
2. ✨ **Enrich** PLAYBOOK.md with learnings
3. 🔗 **Commit** everything to git
4. 📊 **Show summary** (tokens, files, next steps)

**Zero manual logging.** It just happens.

---

## 📁 Projects Supported

✅ **PLAYBOOK_IA/** projects
- Reflexia_PageAccueil_Aout2026
- Blog articles (BLOG_FACTORY)
- Audits (SEO, performance, etc.)
- Any documented livrable

✅ **Claude improvements**
- Skill creation/refinement
- Process optimization
- Documentation updates
- Feature implementation

✅ **Custom projects**
- Create new project on demand
- Any long-running work worth logging

---

## 🚀 Usage

### At Start of Session
Just tell Claude you're starting work. Claude will:
```
📋 AVAILABLE PROJECTS

1. Reflexia_PageAccueil_Aout2026
   Last session: 18 août, point d'arrêt = [description]

2. Blog_ChatGPT_vs_Claude_Aout26
   Last session: 16 août, point d'arrêt = [description]

3. Skill_Playbook_Optimization
   Last session: Not started yet

4. [Create new project]

Which one? (1-4)
```

**You respond:** `1`

Claude then:
```
✅ REFLEXIA_PAGEACCUEIL_AOUT2026

Previous session ended here:
→ SLIDES_v2_Accessible.html (images avant/après needed)

What's the plan?
A) Continue adding images
B) Do something else
C) Check what's on the agenda

Confirm? (A/B/C)
```

### At End of Session
Claude automatically:
```
✅ SESSION LOGGED

Work done:
- SLIDES_v2_Accessible.html ✓ images added
- README-IMAGES.md ✓ completed

Next session starts at:
→ Enregistrer vidéo YouTube

Tokens: ~85k
Cost: €0.35
Time: 1h 30min

Ready for next: Same workflow!
```

---

## 🎬 SLIDES.html — deck de session, construit comme un script de rétention

Le deck de fin de session **n'est pas un rapport**. C'est un script fait pour
être lu jusqu'au bout — dans les titres, dans l'enchaînement, dans la fin.
Accessible en langage courant ; technique seulement là où il faut retenir un
terme.

**Copier :** `/home/radoraj/PLAYBOOK_IA/templates/SLIDES_TEMPLATE.html`, remplacer
les `[PLACEHOLDER]`, **ne pas toucher la structure CSS**.
**Référence complète et validée à imiter :**
`/home/radoraj/PLAYBOOK_IA/ARTEASY/SLIDES_sprint_lancement_2026-08-29.html`.

### Mindset rétention — experts appliqués

- **Paddy Galloway** — les 15 premières secondes, le gap de curiosité, la promesse tenue vite
- **MrBeast** — relancer la "vidéo" à chaque scène, zéro temps mort, monter l'enjeu
- **Ed Lawrence / Film Booth** — accroche → promesse → boucles ouvertes → payoffs, ré-accrocher à chaque acte
- **Jenny Hoyos** — phrases courtes, chaque ligne appelle la suivante, aucune ligne gratuite
- **Johnny Harris** — montrer pas raconter, l'enjeu, la preuve visuelle

### Le motif de chaque scène (obligatoire)

1. **Titre-accroche** en langage parlé, en "tu/on" — **jamais** "Livrable 1/4",
   "Donnée de sortie". Écrire ce qu'on dirait à voix haute :
   « Le fichier que personne ne rouvre → l'appli qu'on ouvre chaque matin. »
2. **Narration** (`.vo`) — la voix de la vidéo, ce qu'on lirait au micro. 2-3 phrases max.
3. **Preuve visuelle** — timeline / grid-2 / grid-4 / stat-grid / case-steps / checklist.
4. **Boucle ouverte** (`.loop`) en bas — une question ou un teaser vers la scène
   suivante : « Mais entre l'idée et les 6 pages, il y a eu un moment où ça a failli déraper. »

### L'arc (ordre des scènes)

1. **Cold open** — le payoff + l'enjeu + une question. Donner le résultat tout de suite, pas de mise en bouche.
2. **Donnée d'entrée** — le prompt BRUT, tel quel dans un encart mono, jamais résumé ; encadré d'une question.
3. **Contexte / enjeu** — bref, seulement le nécessaire.
4. *(si pertinent)* **La décision qui tranche / le recadrage.**
5. **La méthode** — comment on a travaillé : skill / décisions par choix fermés / experts convoqués / mémoire.
6→N. **Un beat par livrable** — chacun ouvre une boucle vers le suivant, l'enjeu monte.
   Objectif + Comment (skill + experts nommés + tâches) + Rendu vérifiable (fichier / lien / commit).
N. **Le grain de sable** — un obstacle réel résolu en direct, à mi-parcours (ré-engagement), en mini-process numéroté.
N. **Les chiffres** — le payoff. Temps réel évalué sur des faits vérifiables (mtimes fichiers, git, logs) — **jamais** "quelques heures".
N. **Qui décide quoi** — répartition humain/IA + le ratio, avec la nuance « les X % de décisions ont tout orienté ».
N. **La checklist de sortie** — ce qui est fait / ce qui dépend de l'utilisateur maintenant.
N. **Le truc que personne te dit** — l'insight de fond, juste avant la fin (ré-engage une dernière fois).
Dernière. **Clôture** — CALLBACK au chiffre/enjeu du cold open + la seule action + une ligne forward
   (« Prochain épisode : … »). **JAMAIS "merci d'avoir suivi".**

Toute la substance playbook obligatoire (entrée, contexte, processus, contrôle,
sortie, résultats+temps, cas vécu, clôture) reste présente — seulement re-titrée
et ré-ordonnée pour la rétention.

### Termes techniques

Isolés dans des encarts `.terme` : label mono "terme à retenir" + le terme + **1 ligne**
de définition concrète. Un par notion clé (ex. dans le deck ArtEasy : ICP, value stack,
attention ratio 1:1, open loop, founder-led sales, indicateur avancé…). Le reste du texte
reste en langage courant — **pas de jargon dans la narration**.

### Design (inchangé)

Icônes SVG ligne uniquement (jamais d'emoji), apparition en cascade à chaque
changement de slide, encarts à badge d'icône teinté, palette et typo du template
conservées **sauf** `--accent` / `--night-accent` = couleur de marque du projet.
Un slide = une idée.

---

## 📊 What Gets Logged

For EVERY session, Claude automatically records:

```
Session N — [Date/Time]
├── Work done (livrables created/modified)
├── Errors found + fixes applied
├── Decisions made + reasoning
├── Learnings & insights
├── Point d'arrêt (exactly where to resume)
├── Tokens used
├── Time spent
└── Next steps
```

All in **SESSION_LOG.md** inside the project folder.

---

## 🔄 The Loop

```
START: Claude proposes projects
         ↓
User chooses
         ↓
Claude reads SESSION_LOG.md
         ↓
Claude asks: Continue? New direction?
         ↓
User confirms
         ↓
WORK HAPPENS
         ↓
END: Claude automatically logs everything
         ↓
Next session: Repeat (all history preserved)
```

**No manual work. No logging overhead. Just work.**

---

## 💡 Key Features

✅ **Smart project detection** — knows about PLAYBOOK_IA, improvements, skills  
✅ **Point d'arrêt memory** — always knows where you left off  
✅ **Auto-logging** — no "remember to document" moments  
✅ **Enriches playbooks** — learnings captured in real-time  
✅ **Git integration** — commits happen automatically  
✅ **Works everywhere** — projects, Claude improvements, skills, etc.  
✅ **Zero friction** — just tell Claude you're starting work  

---

## 🎯 When to Use

✅ Starting ANY work session ("I want to work on...")  
✅ Resuming a project ("What's left to do on...")  
✅ Creating a new skill or improvement  
✅ Any work that should be documented for next time  

---

## 🚫 When NOT to Use

❌ Quick one-off tasks (no logging needed)  
❌ Exploratory work with no deliverables  
❌ Casual questions (just ask normally)  

---

## 📝 Example Full Cycle

```
User: "I want to work today"

Claude: [Shows project list]

User: "1 - Reflexia homepage"

Claude: [Reads log]
"Last time we needed images. Should we add them?"

User: "Yes"

Claude: [Does work for 2h]
[Adds images, tests, validates]

Claude: [Auto-logs]
✅ SESSION LOGGED
Session 3: Images added, responsive tested
Next: YouTube recording
Tokens: 85k, Time: 2h

User: "Cool, done for today"

[Next session, same workflow — Claude knows exactly where to resume]
```

---

## 🔧 Technical Details

**Project Structure:**
```
/PLAYBOOK_IA/[ProjectName]/
├── SESSION_LOG.md (auto-managed)
├── PLAYBOOK.md (enriched auto)
├── SLIDES_<sujet>_<date>.html   (deck de session — script de rétention, voir plus haut)
└── [other files]
```
Modèle de deck : `/PLAYBOOK_IA/templates/SLIDES_TEMPLATE.html`
Référence validée : `/PLAYBOOK_IA/ARTEASY/SLIDES_sprint_lancement_2026-08-29.html`

**Logging Triggered:**
- At START of session (read point d'arrêt)
- At END of session (create/update log)

**Auto-Enrichment:**
- PLAYBOOK.md gets learnings added
- End-of-session checklist updated
- Git commits SESSION_LOG.md

---

**Status: ACTIVE** ✅  
**Use at:** START and END of every session  
**Works for:** ALL projects (PLAYBOOK_IA, improvements, skills, etc.)

## Convention SESSIONS/ pour ERP ARTISAN

À chaque session (cloud ou CLI) :
- DÉBUT : créer `SESSIONS/AAAA-MM-JJ-HHMM-[cloud|cli]-[slug].md` avec objectif + état lu
- FIN : compléter le fichier avec ce qui a été fait, décisions, livrables, prochaine étape
- Commiter : git add SESSIONS/ && git commit -m "session: [date] [slug]" && git push
