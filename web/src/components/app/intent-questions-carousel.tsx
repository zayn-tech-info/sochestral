"use client";

import { useId, useState, type FormEvent } from "react";
import { ChevronRight } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import type { IntentAnswer, IntentQuestion } from "@/lib/product-api";
import { productMotion } from "./product-motion-provider";

export function IntentQuestionsCarousel({
  questions,
  disabled = false,
  onComplete,
}: {
  questions: IntentQuestion[];
  disabled?: boolean;
  onComplete: (answers: IntentAnswer[]) => void;
}) {
  const reduceMotion = useReducedMotion();
  const panelId = useId();
  const [expanded, setExpanded] = useState(true);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<IntentAnswer[]>([]);
  const [customOpen, setCustomOpen] = useState(false);
  const [customText, setCustomText] = useState("");
  const question = questions[index];
  if (!question) return null;

  const transition = reduceMotion
    ? { duration: 0 }
    : { type: "spring" as const, stiffness: 380, damping: 32, mass: 0.85 };

  function advance(answer: IntentAnswer) {
    const nextAnswers = [
      ...answers.filter((entry) => entry.questionId !== answer.questionId),
      answer,
    ];
    setAnswers(nextAnswers);
    setCustomOpen(false);
    setCustomText("");
    if (index >= questions.length - 1) {
      onComplete(nextAnswers);
      return;
    }
    setIndex((current) => current + 1);
  }

  function pickOption(optionId: string, custom?: boolean) {
    if (disabled) return;
    if (custom) {
      setCustomOpen(true);
      return;
    }
    advance({ questionId: question!.id, optionId });
  }

  function submitCustom(event: FormEvent) {
    event.preventDefault();
    const text = customText.trim();
    if (!text || disabled) return;
    advance({
      questionId: question!.id,
      optionId: "custom",
      customText: text,
    });
  }

  return (
    <section
      className={`intent-carousel${expanded ? "" : " intent-carousel-collapsed"}`}
      aria-label="Clarify intent"
    >
      <button
        type="button"
        className="intent-carousel-toggle"
        aria-expanded={expanded}
        aria-controls={panelId}
        onClick={() => setExpanded((current) => !current)}
      >
        <ChevronRight
          className="intent-carousel-chevron size-3.5"
          aria-hidden="true"
        />
        <span className="intent-carousel-toggle-label">
          {expanded ? "Clarify intent" : question.prompt}
        </span>
        {!expanded ? (
          <span className="intent-carousel-toggle-meta">
            {index + 1} of {questions.length}
          </span>
        ) : null}
      </button>
      <motion.div
        id={panelId}
        initial={false}
        animate={{
          height: expanded ? "auto" : 0,
          opacity: expanded ? 1 : 0,
        }}
        transition={reduceMotion ? { duration: 0 } : productMotion.quick}
        className="intent-carousel-panel"
        aria-hidden={!expanded}
      >
        <div className="intent-carousel-panel-inner">
          <div className="intent-carousel-progress" aria-hidden="true">
            {questions.map((entry, dotIndex) => (
              <span
                key={entry.id}
                className={
                  dotIndex === index
                    ? "intent-carousel-dot intent-carousel-dot-active"
                    : dotIndex < index
                      ? "intent-carousel-dot intent-carousel-dot-done"
                      : "intent-carousel-dot"
                }
              />
            ))}
          </div>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={question.id}
              className="intent-carousel-card"
              initial={reduceMotion ? false : { opacity: 0, x: 28 }}
              animate={{ opacity: 1, x: 0 }}
              exit={reduceMotion ? undefined : { opacity: 0, x: -24 }}
              transition={transition}
            >
              <p className="intent-carousel-prompt">{question.prompt}</p>
              {question.reason ? (
                <p className="intent-carousel-reason">{question.reason}</p>
              ) : null}
              <ul className="intent-carousel-options">
                {question.options.map((option) => (
                  <li key={option.id}>
                    <button
                      type="button"
                      className={
                        option.recommended
                          ? "intent-carousel-option intent-carousel-option-recommended"
                          : "intent-carousel-option"
                      }
                      disabled={disabled || !expanded}
                      tabIndex={expanded ? undefined : -1}
                      onClick={() => pickOption(option.id, option.custom)}
                    >
                      {option.label}
                      {option.recommended ? (
                        <span className="intent-carousel-recommended">Suggested</span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
              <AnimatePresence initial={false}>
                {customOpen ? (
                  <motion.form
                    key="custom"
                    className="intent-carousel-custom"
                    initial={reduceMotion ? false : { opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={reduceMotion ? undefined : { opacity: 0, height: 0 }}
                    transition={productMotion.quick}
                    onSubmit={submitCustom}
                  >
                    <label htmlFor={`intent-custom-${question.id}`} className="sr-only">
                      Custom answer
                    </label>
                    <input
                      id={`intent-custom-${question.id}`}
                      value={customText}
                      onChange={(event) => setCustomText(event.target.value)}
                      placeholder="Tell Sochestral what you want"
                      maxLength={500}
                      disabled={disabled || !expanded}
                      tabIndex={expanded ? undefined : -1}
                      autoFocus={expanded}
                    />
                    <button
                      type="submit"
                      disabled={disabled || !expanded || !customText.trim()}
                      tabIndex={expanded ? undefined : -1}
                    >
                      Continue
                    </button>
                  </motion.form>
                ) : null}
              </AnimatePresence>
            </motion.div>
          </AnimatePresence>
        </div>
      </motion.div>
    </section>
  );
}
