import angular from 'angular';
import { OperaBookmarkService } from './shared/opera-bookmark/opera-bookmark.service';

export const operaModule = angular.module('opera', []).service('BookmarkService', OperaBookmarkService).name;
