// The questionnaire every course uses.
//
// The same list drives three things: what the browser shows, what the
// server accepts, and what gets stored. "version" is saved with every
// response, so if the questions ever change, old answers can still be
// read against the questions that were actually asked.
//
// Option *values* ("never", "0-2") are stable keys that get stored.
// Option *labels* are only for display and can be reworded freely.

const frequencyOptions = [
  { value: "never", label: "Never" },
  { value: "rarely", label: "Rarely" },
  { value: "sometimes", label: "Sometimes" },
  { value: "often", label: "Often" },
  { value: "always", label: "Always" },
];

const anonymityHelp = "Don't include your name or details that identify you.";

export const questionnaire = {
  version: 1,
  questions: [
    {
      id: "teaching_overall",
      type: "scale",
      prompt: "Overall, how effective was this professor's teaching?",
      required: true,
      lowLabel: "Poor",
      highLabel: "Excellent",
    },
    {
      id: "clarity",
      type: "scale",
      prompt: "How clearly did the professor explain new ideas?",
      required: true,
      lowLabel: "Very unclear",
      highLabel: "Very clear",
    },
    {
      id: "grading_timeliness",
      type: "frequency",
      prompt: "How often was graded work returned in time to help with the next assignment?",
      required: true,
      options: frequencyOptions,
    },
    {
      id: "office_hours",
      type: "frequency",
      prompt: "How often was the professor available during posted office hours?",
      required: true,
      options: [...frequencyOptions, { value: "na", label: "I didn't go to office hours" }],
    },
    {
      id: "assessment_fit",
      type: "scale",
      prompt: "How well did exams and assignments reflect what was taught?",
      required: true,
      lowLabel: "Not at all",
      highLabel: "Very well",
    },
    {
      id: "respect",
      type: "scale",
      prompt: "How approachable and respectful was the professor toward students?",
      required: true,
      lowLabel: "Not at all",
      highLabel: "Extremely",
    },
    {
      id: "workload",
      type: "choice",
      prompt: "About how many hours per week did you spend on this course outside class?",
      required: true,
      options: [
        { value: "0-2", label: "0–2 hours" },
        { value: "3-5", label: "3–5 hours" },
        { value: "6-8", label: "6–8 hours" },
        { value: "9-11", label: "9–11 hours" },
        { value: "12+", label: "12 or more hours" },
      ],
    },
    {
      id: "recommend",
      type: "scale",
      prompt: "How likely are you to recommend this course to a friend?",
      required: true,
      lowLabel: "Not likely",
      highLabel: "Very likely",
    },
    {
      id: "keep",
      type: "text",
      prompt: "What should the professor keep doing?",
      required: false,
      help: anonymityHelp,
      maxLength: 2000,
    },
    {
      id: "improve",
      type: "text",
      prompt: "What is one thing that would make this course better?",
      required: false,
      help: anonymityHelp,
      maxLength: 2000,
    },
  ],
};
