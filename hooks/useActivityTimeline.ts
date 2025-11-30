/**
 * Custom hook for managing activity timeline logic
 * Extracts business logic from ActivityTimelineModal for better testability and reusability
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { Activity, ActivityTemplate, Waypoint, ActivityDefinition } from '../types';
import { generateSecureId } from '../utils/crypto';

const TEMPLATES_STORAGE_KEY = 'lunagis_activity_templates';

// Helper functions for template management
const loadTemplatesFromStorage = (showError?: (message: string, title?: string) => void): ActivityTemplate[] => {
  try {
    const stored = localStorage.getItem(TEMPLATES_STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    showError?.(`Failed to load activity templates: ${errorMessage}`, 'Template Load Error');
    return [];
  }
};

const saveTemplatesToStorage = (templates: ActivityTemplate[], showError?: (message: string, title?: string) => void) => {
  try {
    localStorage.setItem(TEMPLATES_STORAGE_KEY, JSON.stringify(templates));
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    showError?.(`Failed to save activity templates: ${errorMessage}`, 'Template Save Error');
  }
};

const generateId = () => generateSecureId('activity');

interface UseActivityTimelineOptions {
  waypoint: Waypoint;
  activityDefinitions: ActivityDefinition[];
  showError?: (message: string, title?: string) => void;
}

export function useActivityTimeline({ waypoint, activityDefinitions, showError }: UseActivityTimelineOptions) {
  // State
  const [activities, setActivities] = useState<Activity[]>(waypoint.activities || []);
  const [description, setDescription] = useState(waypoint.description || '');
  const [isAddDropdownOpen, setIsAddDropdownOpen] = useState(false);
  const [isTemplateDropdownOpen, setIsTemplateDropdownOpen] = useState(false);
  const [templates, setTemplates] = useState<ActivityTemplate[]>(loadTemplatesFromStorage(showError));
  const [showSaveTemplateDialog, setShowSaveTemplateDialog] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [showLoadConfirmation, setShowLoadConfirmation] = useState(false);
  const [templateToLoad, setTemplateToLoad] = useState<ActivityTemplate | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Refs for click outside detection
  const addDropdownRef = useRef<HTMLDivElement>(null);
  const templateDropdownRef = useRef<HTMLDivElement>(null);

  // Track unsaved changes
  useEffect(() => {
    const originalActivities = waypoint.activities || [];
    const originalDescription = waypoint.description || '';
    const activitiesChanged = JSON.stringify(activities) !== JSON.stringify(originalActivities);
    const descriptionChanged = description !== originalDescription;
    setHasUnsavedChanges(activitiesChanged || descriptionChanged);
  }, [activities, description, waypoint.activities, waypoint.description]);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (addDropdownRef.current && !addDropdownRef.current.contains(event.target as Node)) {
        setIsAddDropdownOpen(false);
      }
      if (templateDropdownRef.current && !templateDropdownRef.current.contains(event.target as Node)) {
        setIsTemplateDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Activity operations
  const handleAddActivity = useCallback((type: string) => {
    const definition = activityDefinitions.find(def => def.id === type);
    const newActivity: Activity = {
      id: generateId(),
      type,
      duration: definition?.defaultDuration ?? 60,
    };
    setActivities(prev => [...prev, newActivity]);
    setIsAddDropdownOpen(false);
  }, [activityDefinitions]);

  const handleRemoveActivity = useCallback((id: string) => {
    setActivities(prev => prev.filter(a => a.id !== id));
  }, []);

  const handleMoveUp = useCallback((index: number) => {
    if (index === 0) return;
    setActivities(prev => {
      const newActivities = [...prev];
      [newActivities[index - 1], newActivities[index]] = [newActivities[index], newActivities[index - 1]];
      return newActivities;
    });
  }, []);

  const handleMoveDown = useCallback((index: number) => {
    setActivities(prev => {
      if (index === prev.length - 1) return prev;
      const newActivities = [...prev];
      [newActivities[index], newActivities[index + 1]] = [newActivities[index + 1], newActivities[index]];
      return newActivities;
    });
  }, []);

  const handleDurationChange = useCallback((id: string, value: string) => {
    const numValue = parseInt(value);
    if (value === '' || (!isNaN(numValue) && numValue >= 0)) {
      setActivities(prev => prev.map(a =>
        a.id === id ? { ...a, duration: value === '' ? 0 : numValue } : a
      ));
    }
  }, []);

  const handleTypeChange = useCallback((id: string, type: string) => {
    setActivities(prev => prev.map(a =>
      a.id === id ? { ...a, type } : a
    ));
  }, []);

  // Template operations
  const handleSaveTemplate = useCallback(() => {
    if (!templateName.trim()) {
      alert('Please enter a template name');
      return;
    }

    const newTemplate: ActivityTemplate = {
      id: generateId(),
      name: templateName.trim(),
      activities: activities.map(a => ({ ...a, id: generateId() })),
    };

    const updatedTemplates = [...templates, newTemplate];
    setTemplates(updatedTemplates);
    saveTemplatesToStorage(updatedTemplates, showError);
    setShowSaveTemplateDialog(false);
    setTemplateName('');
  }, [templateName, activities, templates, showError]);

  const confirmLoadTemplate = useCallback((template: ActivityTemplate) => {
    const clonedActivities = template.activities.map(a => ({
      ...a,
      id: generateId(),
    }));
    setActivities(clonedActivities);
    setShowLoadConfirmation(false);
    setTemplateToLoad(null);
    setIsTemplateDropdownOpen(false);
  }, []);

  const handleLoadTemplate = useCallback((template: ActivityTemplate) => {
    if (hasUnsavedChanges && activities.length > 0) {
      setTemplateToLoad(template);
      setShowLoadConfirmation(true);
      setIsTemplateDropdownOpen(false);
    } else {
      confirmLoadTemplate(template);
    }
  }, [hasUnsavedChanges, activities.length, confirmLoadTemplate]);

  const handleDeleteTemplate = useCallback((templateId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Are you sure you want to delete this template?')) {
      const updatedTemplates = templates.filter(t => t.id !== templateId);
      setTemplates(updatedTemplates);
      saveTemplatesToStorage(updatedTemplates, showError);
    }
  }, [templates, showError]);

  // Validation and save
  const validateAndGetUpdates = useCallback((): Partial<Waypoint> | null => {
    const invalidDuration = activities.find(a => typeof a.duration !== 'number' || a.duration < 0);
    if (invalidDuration) {
      alert('All activity durations must be non-negative numbers');
      return null;
    }

    return {
      activities,
      description: description.trim(),
    };
  }, [activities, description]);

  return {
    // State
    activities,
    description,
    isAddDropdownOpen,
    isTemplateDropdownOpen,
    templates,
    showSaveTemplateDialog,
    templateName,
    showLoadConfirmation,
    templateToLoad,
    hasUnsavedChanges,

    // Refs
    addDropdownRef,
    templateDropdownRef,

    // Setters
    setDescription,
    setIsAddDropdownOpen,
    setIsTemplateDropdownOpen,
    setShowSaveTemplateDialog,
    setTemplateName,
    setShowLoadConfirmation,
    setTemplateToLoad,

    // Activity operations
    handleAddActivity,
    handleRemoveActivity,
    handleMoveUp,
    handleMoveDown,
    handleDurationChange,
    handleTypeChange,

    // Template operations
    handleSaveTemplate,
    handleLoadTemplate,
    confirmLoadTemplate,
    handleDeleteTemplate,

    // Validation
    validateAndGetUpdates,
  };
}
