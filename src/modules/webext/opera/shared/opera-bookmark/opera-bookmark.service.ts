import angular from 'angular';
import { Injectable } from 'angular-ts-decorators';
import { boundMethod } from 'autobind-decorator';
import browser, { Bookmarks as NativeBookmarks } from 'webextension-polyfill';
import { BookmarkChangeType, BookmarkContainer, BookmarkType } from '../../../../shared/bookmark/bookmark.enum';
import {
  AddNativeBookmarkChangeData,
  Bookmark,
  BookmarkChange,
  ModifyNativeBookmarkChangeData,
  MoveNativeBookmarkChangeData,
  OnChildrenReorderedReorderInfoType,
  ReorderNativeBookmarkChangeData
} from '../../../../shared/bookmark/bookmark.interface';
import { BookmarkHelperService } from '../../../../shared/bookmark/bookmark-helper/bookmark-helper.service';
import { BaseError, ContainerNotFoundError, FailedRemoveNativeBookmarksError } from '../../../../shared/errors/errors';
import { PlatformService, WebpageMetadata } from '../../../../shared/global-shared.interface';
import { LogService } from '../../../../shared/log/log.service';
import { SettingsService } from '../../../../shared/settings/settings.service';
import { StoreService } from '../../../../shared/store/store.service';
import { UtilityService } from '../../../../shared/utility/utility.service';
import { BookmarkIdMapperService } from '../../../shared/bookmark-id-mapper/bookmark-id-mapper.service';
import { WebExtBookmarkService } from '../../../shared/webext-bookmark/webext-bookmark.service';

@Injectable('BookmarkService')
export class OperaBookmarkService extends WebExtBookmarkService {
  public $q: ng.IQService;
  public $injector: ng.auto.IInjectorService;
  public $timeout: ng.ITimeoutService;
  public bookmarkHelperSvc: BookmarkHelperService;
  public bookmarkIdMapperSvc: BookmarkIdMapperService;
  public logSvc: LogService;
  public platformSvc: PlatformService;
  public settingsSvc: SettingsService;
  public storeSvc: StoreService;
  public utilitySvc: UtilityService;
  unsupportedContainers: string[] = [];

  constructor(
    $injector: ng.auto.IInjectorService,
    $q: ng.IQService,
    $timeout: ng.ITimeoutService,
    bookmarkHelperSvc: BookmarkHelperService,
    bookmarkIdMapperSvc: BookmarkIdMapperService,
    logSvc: LogService,
    platformSvc: PlatformService,
    settingsSvc: SettingsService,
    storeSvc: StoreService,
    utilitySvc: UtilityService
  ) {
    super(
      $injector,
      $q,
      $timeout,
      bookmarkHelperSvc,
      bookmarkIdMapperSvc,
      logSvc,
      platformSvc,
      settingsSvc,
      storeSvc,
      utilitySvc
    );
    this.$injector = $injector;
    this.$q = $q;
    this.$timeout = $timeout;
    this.bookmarkHelperSvc = bookmarkHelperSvc;
    this.bookmarkIdMapperSvc = bookmarkIdMapperSvc;
    this.logSvc = logSvc;
    this.platformSvc = platformSvc;
    this.settingsSvc = settingsSvc;
    this.storeSvc = storeSvc;
    this.utilitySvc = utilitySvc;
  }

  clearNativeBookmarks(): ng.IPromise<void> {
    // Get native container ids
    return this.getNativeContainerIds()
      .then((nativeContainerIds) => {
        const menuBookmarksId = nativeContainerIds.get(BookmarkContainer.Menu);
        const otherBookmarksId = nativeContainerIds.get(BookmarkContainer.Other);
        const toolbarBookmarksId = nativeContainerIds.get(BookmarkContainer.Toolbar);

        // Clear menu bookmarks
        const clearMenu = this.$q((resolve, reject) => {
          if (!menuBookmarksId) {
            resolve();
            return;
          }
          return browser.bookmarks
            .getChildren(menuBookmarksId)
            .then((results) => {
              return this.$q.all(
                results.map((child) => {
                  return this.removeNativeBookmarks(child.id);
                })
              );
            })
            .then(resolve)
            .catch((err) => {
              this.logSvc.logWarning('Error clearing menu bookmarks');
              reject(err);
            });
        });

        // Clear other bookmarks
        const clearOthers = this.$q((resolve, reject) => {
          if (!otherBookmarksId) {
            resolve();
            return;
          }
          return browser.bookmarks
            .getChildren(otherBookmarksId)
            .then((results) => {
              return this.$q.all(
                results.map((child) => {
                  return this.removeNativeBookmarks(child.id);
                })
              );
            })
            .then(resolve)
            .catch((err) => {
              this.logSvc.logWarning('Error clearing other bookmarks');
              reject(err);
            });
        });

        // Clear bookmarks toolbar if enabled
        const clearToolbar = this.$q((resolve, reject) => {
          return this.settingsSvc
            .syncBookmarksToolbar()
            .then((syncBookmarksToolbar) => {
              if (!syncBookmarksToolbar || !toolbarBookmarksId) {
                this.logSvc.logInfo('Not clearing toolbar');
                resolve();
                return;
              }
              return browser.bookmarks.getChildren(toolbarBookmarksId).then((results) => {
                return this.$q.all(
                  results.map((child) => {
                    return this.removeNativeBookmarks(child.id);
                  })
                );
              });
            })
            .then(resolve)
            .catch((err) => {
              this.logSvc.logWarning('Error clearing bookmarks toolbar');
              reject(err);
            });
        });

        return this.$q.all([clearMenu, clearOthers, clearToolbar]).then(() => {});
      })
      .catch((err) => {
        throw new FailedRemoveNativeBookmarksError(undefined, err);
      });
  }

  createNativeBookmarksFromBookmarks(bookmarks: Bookmark[]): ng.IPromise<number> {
    // Get containers
    const menuContainer = bookmarks.find((x) => {
      return x.title === BookmarkContainer.Menu;
    });
    const otherContainer = bookmarks.find((x) => {
      return x.title === BookmarkContainer.Other;
    });
    const toolbarContainer = bookmarks.find((x) => {
      return x.title === BookmarkContainer.Toolbar;
    });

    return this.getNativeContainerIds()
      .then((nativeContainerIds) => {
        const menuBookmarksId = nativeContainerIds.get(BookmarkContainer.Menu);
        const otherBookmarksId = nativeContainerIds.get(BookmarkContainer.Other);
        const toolbarBookmarksId = nativeContainerIds.get(BookmarkContainer.Toolbar);

        // Populate menu bookmarks
        const populateMenu = this.$q<number>((resolve, reject) => {
          if (!menuContainer || !menuBookmarksId) {
            return resolve(0);
          }
          return browser.bookmarks
            .getSubTree(menuBookmarksId)
            .then(() => {
              return this.createNativeBookmarkTree(menuBookmarksId, menuContainer.children);
            })
            .then(resolve)
            .catch((err) => {
              this.logSvc.logInfo('Error populating menu bookmarks.');
              reject(err);
            });
        });

        // Populate other bookmarks
        const populateOther = this.$q<number>((resolve, reject) => {
          if (!otherContainer || !otherBookmarksId) {
            return resolve(0);
          }
          return browser.bookmarks
            .getSubTree(otherBookmarksId)
            .then(() => {
              return this.createNativeBookmarkTree(otherBookmarksId, otherContainer.children);
            })
            .then(resolve)
            .catch((err) => {
              this.logSvc.logInfo('Error populating other bookmarks.');
              reject(err);
            });
        });

        // Populate bookmarks toolbar if enabled
        const populateToolbar = this.$q<number>((resolve, reject) => {
          if (!toolbarContainer || !toolbarBookmarksId) {
            return resolve(0);
          }
          return this.settingsSvc
            .syncBookmarksToolbar()
            .then((syncBookmarksToolbar) => {
              if (!syncBookmarksToolbar) {
                this.logSvc.logInfo('Not populating toolbar');
                resolve();
                return;
              }
              return browser.bookmarks.getSubTree(toolbarBookmarksId).then(() => {
                return this.createNativeBookmarkTree(toolbarBookmarksId, toolbarContainer.children);
              });
            })
            .then(resolve)
            .catch((err) => {
              this.logSvc.logInfo('Error populating bookmarks toolbar.');
              reject(err);
            });
        });

        return this.$q.all([populateMenu, populateOther, populateToolbar]);
      })
      .then((totals) => {
        // Move native unsupported containers into the correct order
        return this.reorderUnsupportedContainers().then(() => {
          return totals.filter(Boolean).reduce((a, b) => a + b, 0);
        });
      });
  }

  createNativeSeparator(
    parentId: string,
    nativeToolbarContainerId: string
  ): ng.IPromise<NativeBookmarks.BookmarkTreeNode> {
    return browser.bookmarks.create({
      parentId,
      title: '─',
      type: BookmarkType.Separator,
      url: 'data:text/plain;charset=UTF-8,separator'
    });
  }

  disableEventListeners(): ng.IPromise<void> {
    browser.bookmarks.onCreated.removeListener(this.onNativeBookmarkCreated);
    browser.bookmarks.onRemoved.removeListener(this.onNativeBookmarkRemoved);
    browser.bookmarks.onChanged.removeListener(this.onNativeBookmarkChanged);
    browser.bookmarks.onMoved.removeListener(this.onNativeBookmarkMoved);
    return this.$q.resolve();
  }

  enableEventListeners(): ng.IPromise<void> {
    return this.disableEventListeners()
      .then(() => {
        return this.utilitySvc.isSyncEnabled();
      })
      .then((syncEnabled) => {
        if (!syncEnabled) {
          return;
        }
        browser.bookmarks.onCreated.addListener(this.onNativeBookmarkCreated);
        browser.bookmarks.onRemoved.addListener(this.onNativeBookmarkRemoved);
        browser.bookmarks.onChanged.addListener(this.onNativeBookmarkChanged);
        browser.bookmarks.onMoved.addListener(this.onNativeBookmarkMoved);
      })
      .catch((err) => {
        this.logSvc.logWarning('Failed to enable event listeners');
        throw new BaseError(undefined, err);
      });
  }

  ensureContainersExist(bookmarks: Bookmark[]): Bookmark[] {
    // Add menu container if not present
    const menuContainer = bookmarks.find((x) => {
      return x.title === BookmarkContainer.Menu;
    });
    if (!menuContainer) {
      bookmarks.push(this.bookmarkHelperSvc.getContainer(BookmarkContainer.Menu, bookmarks));
    }

    // Add other container if not present
    const otherContainer = bookmarks.find((x) => {
      return x.title === BookmarkContainer.Other;
    });
    if (!otherContainer) {
      bookmarks.push(this.bookmarkHelperSvc.getContainer(BookmarkContainer.Other, bookmarks));
    }

    // Add toolbar container if not present and sync enabled
    const syncBookmarksToolbar = this.settingsSvc.syncBookmarksToolbar();
    if (syncBookmarksToolbar) {
      const toolbarContainer = bookmarks.find((x) => {
        return x.title === BookmarkContainer.Toolbar;
      });
      if (!toolbarContainer) {
        bookmarks.push(this.bookmarkHelperSvc.getContainer(BookmarkContainer.Toolbar, bookmarks));
      }
    }
    return bookmarks;
  }

  getNativeBookmarksAsBookmarks(): ng.IPromise<Bookmark[]> {
    let allNativeBookmarks = [];

    // Get native container ids
    return this.getNativeContainerIds()
      .then((nativeContainerIds) => {
        const menuBookmarksId = nativeContainerIds.get(BookmarkContainer.Menu);
        const otherBookmarksId = nativeContainerIds.get(BookmarkContainer.Other);
        const toolbarBookmarksId = nativeContainerIds.get(BookmarkContainer.Toolbar);

        // Get menu bookmarks
        const getMenuBookmarks =
          menuBookmarksId === undefined
            ? this.$q.resolve<Bookmark[]>(undefined)
            : browser.bookmarks.getSubTree(menuBookmarksId).then((results) => {
                const [menuContainer] = results;
                if (menuContainer.children.length > 0) {
                  // Add all bookmarks into flat array
                  this.bookmarkHelperSvc.eachBookmark((bookmark) => {
                    allNativeBookmarks.push(bookmark);
                  }, menuContainer.children);
                  return this.bookmarkHelperSvc.getNativeBookmarksAsBookmarks(menuContainer.children);
                }
              });

        // Get other bookmarks
        const getOtherBookmarks =
          otherBookmarksId === undefined
            ? this.$q.resolve<Bookmark[]>(undefined)
            : browser.bookmarks.getSubTree(otherBookmarksId).then((results) => {
                const [otherContainer] = results;
                if (otherContainer.children.length > 0) {
                  // Add all bookmarks into flat array
                  this.bookmarkHelperSvc.eachBookmark((bookmark) => {
                    allNativeBookmarks.push(bookmark);
                  }, otherContainer.children);
                  return this.bookmarkHelperSvc.getNativeBookmarksAsBookmarks(otherContainer.children);
                }
              });

        // Get toolbar bookmarks if enabled
        const getToolbarBookmarks =
          toolbarBookmarksId === undefined
            ? this.$q.resolve<Bookmark[]>(undefined)
            : browser.bookmarks.getSubTree(toolbarBookmarksId).then((results) => {
                const [toolbarContainer] = results;
                return this.settingsSvc.syncBookmarksToolbar().then((syncBookmarksToolbar) => {
                  if (syncBookmarksToolbar && toolbarContainer.children.length > 0) {
                    // Add all bookmarks into flat array
                    this.bookmarkHelperSvc.eachBookmark((bookmark) => {
                      allNativeBookmarks.push(bookmark);
                    }, toolbarContainer.children);
                    return this.bookmarkHelperSvc.getNativeBookmarksAsBookmarks(toolbarContainer.children);
                  }
                });
              });

        return this.$q.all([getMenuBookmarks, getOtherBookmarks, getToolbarBookmarks]);
      })
      .then((results) => {
        const [menuBookmarks, otherBookmarks, toolbarBookmarks] = results;
        const bookmarks: Bookmark[] = [];

        // Add menu container if bookmarks present
        const menuContainer = this.bookmarkHelperSvc.getContainer(BookmarkContainer.Menu, bookmarks, true);
        if (menuBookmarks?.length > 0) {
          menuContainer.children = menuBookmarks;
        }

        // Add other container if bookmarks present
        const otherContainer = this.bookmarkHelperSvc.getContainer(BookmarkContainer.Other, bookmarks, true);
        if (otherBookmarks?.length > 0) {
          otherContainer.children = otherBookmarks;
        }

        // Add toolbar container if bookmarks present
        const toolbarContainer = this.bookmarkHelperSvc.getContainer(BookmarkContainer.Toolbar, bookmarks, true);
        if (toolbarBookmarks?.length > 0) {
          toolbarContainer.children = toolbarBookmarks;
        }

        // Filter containers from flat array of bookmarks
        [menuContainer, otherContainer, toolbarContainer].forEach((container) => {
          if (!container) {
            return;
          }

          allNativeBookmarks = allNativeBookmarks.filter((bookmark) => {
            return bookmark.title !== container.title;
          });
        });

        // Sort by date added asc
        allNativeBookmarks = allNativeBookmarks.sort((x, y) => {
          return x.dateAdded - y.dateAdded;
        });

        // Iterate native bookmarks to add unique bookmark ids in correct order
        allNativeBookmarks.forEach((nativeBookmark) => {
          this.bookmarkHelperSvc.eachBookmark((bookmark) => {
            if (
              !bookmark.id &&
              ((!nativeBookmark.url && bookmark.title === nativeBookmark.title) ||
                (nativeBookmark.url && bookmark.url === nativeBookmark.url))
            ) {
              bookmark.id = this.bookmarkHelperSvc.getNewBookmarkId(bookmarks);
            }
          }, bookmarks);
        });

        return bookmarks;
      });
  }

  getNativeContainerIds(): ng.IPromise<Map<BookmarkContainer, string>> {
    return this.utilitySvc
      .isSyncEnabled()
      .then((syncEnabled) => (syncEnabled ? this.bookmarkHelperSvc.getCachedBookmarks() : undefined))
      .then((bookmarks) => {
        // Initialize container ids object using containers defined in bookmarks
        const containerIds = new Map<BookmarkContainer, string>();
        if (!angular.isUndefined(bookmarks)) {
          bookmarks.forEach((x) => {
            containerIds.set(x.title as BookmarkContainer, undefined);
          });
        }

        // Check if Opera's getRootByName API is available
        const operaBookmarks = browser.bookmarks as any;
        if (typeof operaBookmarks.getRootByName === 'function') {
          this.logSvc.logInfo('Using Opera-specific getRootByName API');

          window.alert('Found it!');
          // Use Opera's specific API to get root containers
          return this.$q
            .all([
              operaBookmarks.getRootByName('user_root'),
              operaBookmarks.getRootByName('bookmarks_bar'),
              operaBookmarks.getRootByName('other')
            ])
            .then(([menuNode, toolbarNode, otherNode]) => {
              // Throw an error if a native container is not found
              window.alert(menuNode.title);
              window.alert(toolbarNode.title);
              window.alert(otherNode.title);
              if (!menuNode || !toolbarNode || !otherNode) {
                if (!menuNode) {
                  this.logSvc.logWarning('Missing container: menu bookmarks');
                }
                if (!toolbarNode) {
                  this.logSvc.logWarning('Missing container: toolbar bookmarks');
                }
                if (!otherNode) {
                  this.logSvc.logWarning('Missing container: other bookmarks');
                }
                throw new ContainerNotFoundError();
              }

              // Add container ids to result
              containerIds.set(BookmarkContainer.Menu, menuNode.id);
              containerIds.set(BookmarkContainer.Toolbar, toolbarNode.id);
              containerIds.set(BookmarkContainer.Other, otherNode.id);
              return containerIds;
            });
        }
        this.logSvc.logInfo('Opera-specific getRootByName API not available, using standard API');

        // Fall back to standard WebExtension API
        return browser.bookmarks.getTree().then((tree) => {
          if (!tree || !tree[0] || !tree[0].children) {
            throw new ContainerNotFoundError();
          }

          // Find the root containers
          const rootNode = tree[0];
          const children = rootNode.children;

          // Find bookmark bar/toolbar folder
          const toolbarNode = children.find((node) => node.id === '1' || node.title === 'Bookmarks Bar');
          // Find bookmarks menu folder
          const menuNode = children.find((node) => node.id === '2' || node.title === 'Bookmarks Menu');
          // Find other bookmarks folder
          const otherNode = children.find((node) => node.id === '3' || node.title === 'Other Bookmarks');

          // Throw an error if a native container is not found
          if (!menuNode || !otherNode || !toolbarNode) {
            if (!menuNode) {
              this.logSvc.logWarning('Missing container: menu bookmarks');
            }
            if (!otherNode) {
              this.logSvc.logWarning('Missing container: other bookmarks');
            }
            if (!toolbarNode) {
              this.logSvc.logWarning('Missing container: toolbar bookmarks');
            }
            throw new ContainerNotFoundError();
          }

          // Add container ids to result
          containerIds.set(BookmarkContainer.Menu, menuNode.id);
          containerIds.set(BookmarkContainer.Other, otherNode.id);
          containerIds.set(BookmarkContainer.Toolbar, toolbarNode.id);
          return containerIds;
        });
      });
  }

  removeNativeBookmarks(id: string): ng.IPromise<void> {
    return browser.bookmarks.removeTree(id);
  }

  createNativeBookmarkTree(
    parentId: string,
    bookmarks: Bookmark[],
    nativeToolbarContainerId?: string
  ): ng.IPromise<number> {
    return super.createNativeBookmarkTree(parentId, bookmarks, nativeToolbarContainerId);
  }

  syncChange(changeInfo: BookmarkChange): ng.IPromise<any> {
    return super.syncChange(changeInfo);
  }

  syncNativeBookmarkRemoved(id?: string, removeInfo?: NativeBookmarks.OnRemovedRemoveInfoType): ng.IPromise<void> {
    return super.syncNativeBookmarkRemoved(id, removeInfo);
  }

  reorderUnsupportedContainers(): ng.IPromise<void> {
    return this.$q.resolve();
  }

  @boundMethod
  onNativeBookmarkChildrenReordered(id: string, reorderInfo: OnChildrenReorderedReorderInfoType): ng.IPromise<void> {
    // Create change info
    const data: ReorderNativeBookmarkChangeData = {
      childIds: reorderInfo.childIds,
      parentId: id
    };
    const changeInfo: BookmarkChange = {
      changeData: data,
      type: BookmarkChangeType.ChildrenReordered
    };

    // Queue sync
    this.syncChange(changeInfo);
    return this.$q.resolve();
  }

  @boundMethod
  onNativeBookmarkCreated(id: string, nativeBookmark: NativeBookmarks.BookmarkTreeNode): void {
    this.syncNativeBookmarkCreated(id, nativeBookmark);
  }

  @boundMethod
  onNativeBookmarkChanged(id: string): void {
    this.syncNativeBookmarkChanged(id);
  }

  @boundMethod
  onNativeBookmarkMoved(id: string, moveInfo: NativeBookmarks.OnMovedMoveInfoType): void {
    this.syncNativeBookmarkMoved(id, moveInfo);
  }

  @boundMethod
  onNativeBookmarkRemoved(id: string, removeInfo: NativeBookmarks.OnRemovedRemoveInfoType): void {
    this.syncNativeBookmarkRemoved(id, removeInfo);
  }

  syncNativeBookmarkChanged(id: string): ng.IPromise<void> {
    // Retrieve full bookmark info
    return browser.bookmarks.getSubTree(id).then((results) => {
      const [changedBookmark] = results;

      // Create change info
      const data: ModifyNativeBookmarkChangeData = {
        nativeBookmark: changedBookmark
      };
      const changeInfo: BookmarkChange = {
        changeData: data,
        type: BookmarkChangeType.Modify
      };

      // Queue sync
      this.syncChange(changeInfo);
    });
  }

  syncNativeBookmarkCreated(id: string, nativeBookmark: NativeBookmarks.BookmarkTreeNode): ng.IPromise<void> {
    // Create change info
    const data: AddNativeBookmarkChangeData = {
      nativeBookmark
    };
    const changeInfo: BookmarkChange = {
      changeData: data,
      type: BookmarkChangeType.Add
    };

    // If bookmark is not folder or separator, get page metadata from current tab
    return (
      nativeBookmark.url && !this.bookmarkHelperSvc.nativeBookmarkIsSeparator(nativeBookmark)
        ? this.platformSvc.getPageMetadata()
        : this.$q.resolve<WebpageMetadata>(null)
    ).then((metadata) => {
      // Add metadata if bookmark is current tab location
      if (metadata && nativeBookmark.url === metadata.url) {
        (changeInfo.changeData as AddNativeBookmarkChangeData).nativeBookmark.title = this.utilitySvc.stripTags(
          metadata.title
        );
        (changeInfo.changeData as AddNativeBookmarkChangeData).nativeBookmark.description = this.utilitySvc.stripTags(
          metadata.description
        );
        (changeInfo.changeData as AddNativeBookmarkChangeData).nativeBookmark.tags =
          this.utilitySvc.getTagArrayFromText(metadata.tags);
      }

      // Queue sync
      this.syncChange(changeInfo);
      return this.$q.resolve();
    });
  }

  syncNativeBookmarkMoved(id: string, moveInfo: NativeBookmarks.OnMovedMoveInfoType): ng.IPromise<void> {
    // Create change info
    const data: MoveNativeBookmarkChangeData = {
      ...moveInfo,
      id
    };
    const changeInfo: BookmarkChange = {
      changeData: data,
      type: BookmarkChangeType.Move
    };

    // Queue sync
    this.syncChange(changeInfo);
    return this.$q.resolve();
  }
}
