(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.TaskFlow = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const ADVANCED_STATUSES = new Set(["proceso", "evaluacion", "completado"]);

  function getAssignedTo(task) {
    if (!task) return null;
    return task.assignedTo ?? task.assigned_to ?? null;
  }

  function requiresAssignment(newStatus) {
    return ADVANCED_STATUSES.has(newStatus);
  }

  function validateMove({ task, newStatus, assignTo, currentUser }) {
    if (!requiresAssignment(newStatus)) {
      return { ok: true, nextAssignedTo: null };
    }

    const currentAssignedTo = getAssignedTo(task);
    if (currentAssignedTo) {
      return { ok: true, nextAssignedTo: currentAssignedTo };
    }

    const resolvedAssignTo = assignTo || currentUser || null;
    if (!resolvedAssignTo) {
      return {
        ok: false,
        error: "Debes asignar la tarea antes de moverla a En Proceso, Evaluación o Completado.",
      };
    }

    return { ok: true, nextAssignedTo: resolvedAssignTo };
  }

  return {
    requiresAssignment,
    validateMove,
  };
});
