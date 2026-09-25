'use client';
import {createContext,useContext} from 'react';
import type {Classroom} from '@/lib/classroom/types';
export const ClassroomRefreshContext=createContext<()=>Promise<Classroom|null>>(async()=>null);
export const useClassroomRefresh=()=>useContext(ClassroomRefreshContext);
