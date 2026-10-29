'use client';

import { createContext, useContext, type Dispatch, type SetStateAction } from 'react';

export const LearningRefreshContext = createContext<Dispatch<SetStateAction<boolean>> | null>(null);
export const useLearningRefreshPause = () => useContext(LearningRefreshContext);
