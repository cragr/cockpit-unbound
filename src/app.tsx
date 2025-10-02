/*
 * This file is part of Cockpit.
 *
 * Copyright (C) 2017 Red Hat, Inc.
 *
 * Cockpit is free software; you can redistribute it and/or modify it
 * under the terms of the GNU Lesser General Public License as published by
 * the Free Software Foundation; either version 2.1 of the License, or
 * (at your option) any later version.
 *
 * Cockpit is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License
 * along with Cockpit; If not, see <http://www.gnu.org/licenses/>.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import cockpit from 'cockpit';

import { Alert } from "@patternfly/react-core/dist/esm/components/Alert/index.js";
import { Button } from "@patternfly/react-core/dist/esm/components/Button/index.js";
import { Card, CardBody, CardFooter, CardHeader, CardTitle } from "@patternfly/react-core/dist/esm/components/Card/index.js";
import { Flex, FlexItem } from "@patternfly/react-core/dist/esm/layouts/Flex/index.js";
import { Form, FormGroup } from "@patternfly/react-core/dist/esm/components/Form/index.js";
import { HelperText, HelperTextItem } from "@patternfly/react-core/dist/esm/components/HelperText/index.js";
import { Page, PageSection, PageSectionVariants } from "@patternfly/react-core/dist/esm/components/Page/index.js";
import { Spinner } from "@patternfly/react-core/dist/esm/components/Spinner/index.js";
import { Switch } from "@patternfly/react-core/dist/esm/components/Switch/index.js";
import { TextArea } from "@patternfly/react-core/dist/esm/components/TextArea/index.js";
import { TextInput } from "@patternfly/react-core/dist/esm/components/TextInput/index.js";
import { Title } from "@patternfly/react-core/dist/esm/components/Title/index.js";

import MinusCircleIcon from "@patternfly/react-icons/dist/esm/icons/minus-circle-icon.js";
import PlusCircleIcon from "@patternfly/react-icons/dist/esm/icons/plus-circle-icon.js";

const _ = cockpit.gettext;

const CONFIG_PATH = "/etc/unbound/unbound.conf";

type ServerSettings = {
    verbosity: string;
    port: string;
    interfaces: string[];
    accessControls: string[];
    doIPv4: boolean;
    doIPv6: boolean;
    doUDP: boolean;
    doTCP: boolean;
    hideIdentity: boolean;
    hideVersion: boolean;
    qnameMinimisation: boolean;
    hardenDNSSECStripped: boolean;
    customServerOptions: string;
};

type ParsedConfig = {
    before: string;
    after: string;
    settings: ServerSettings;
};

const defaultSettings: ServerSettings = {
    verbosity: "1",
    port: "53",
    interfaces: [],
    accessControls: [],
    doIPv4: true,
    doIPv6: true,
    doUDP: true,
    doTCP: true,
    hideIdentity: false,
    hideVersion: false,
    qnameMinimisation: true,
    hardenDNSSECStripped: true,
    customServerOptions: "",
};

const cloneSettings = (settings: ServerSettings): ServerSettings => ({
    ...settings,
    interfaces: [...settings.interfaces],
    accessControls: [...settings.accessControls]
});

const toYesNo = (value: boolean) => value ? "yes" : "no";

const parseBoolean = (value: string | undefined, fallback: boolean) => {
    if (!value) {
        return fallback;
    }

    const lowered = value.toLowerCase();
    if (lowered === "yes" || lowered === "true" || lowered === "on") {
        return true;
    }

    if (lowered === "no" || lowered === "false" || lowered === "off") {
        return false;
    }

    return fallback;
};

const parseConfig = (content: string): ParsedConfig => {
    const lines = content.split(/\r?\n/);
    const beforeLines: string[] = [];
    const serverLines: string[] = [];
    const afterLines: string[] = [];

    let inServer = false;
    let afterStarted = false;

    for (const line of lines) {
        if (!inServer && !afterStarted) {
            if (/^\s*server\s*:\s*$/i.test(line)) {
                inServer = true;
                continue;
            }

            beforeLines.push(line);
            continue;
        }

        if (inServer && !afterStarted) {
            if (/^\S/.test(line) && !/^\s*#/.test(line) && line.trim() !== "") {
                afterStarted = true;
            }
        }

        if (inServer && !afterStarted) {
            serverLines.push(line);
        } else {
            afterLines.push(line);
        }
    }

    const settings: ServerSettings = { ...defaultSettings, interfaces: [], accessControls: [], customServerOptions: "" };
    const customLines: string[] = [];

    for (const rawLine of serverLines) {
        const trimmed = rawLine.trim();
        if (!trimmed) {
            customLines.push("");
            continue;
        }

        if (trimmed.startsWith("#")) {
            customLines.push(trimmed);
            continue;
        }

        const match = trimmed.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
        if (!match) {
            customLines.push(trimmed);
            continue;
        }

        const [, key, rawValue] = match;
        const value = rawValue.replace(/^"(.*)"$/, "$1");

        switch (key) {
        case "verbosity":
            settings.verbosity = value;
            break;
        case "port":
            settings.port = value;
            break;
        case "interface":
            settings.interfaces.push(value);
            break;
        case "access-control":
            settings.accessControls.push(value);
            break;
        case "do-ip4":
            settings.doIPv4 = parseBoolean(value, settings.doIPv4);
            break;
        case "do-ip6":
            settings.doIPv6 = parseBoolean(value, settings.doIPv6);
            break;
        case "do-udp":
            settings.doUDP = parseBoolean(value, settings.doUDP);
            break;
        case "do-tcp":
            settings.doTCP = parseBoolean(value, settings.doTCP);
            break;
        case "hide-identity":
            settings.hideIdentity = parseBoolean(value, settings.hideIdentity);
            break;
        case "hide-version":
            settings.hideVersion = parseBoolean(value, settings.hideVersion);
            break;
        case "qname-minimisation":
            settings.qnameMinimisation = parseBoolean(value, settings.qnameMinimisation);
            break;
        case "harden-dnssec-stripped":
            settings.hardenDNSSECStripped = parseBoolean(value, settings.hardenDNSSECStripped);
            break;
        default:
            customLines.push(trimmed);
            break;
        }
    }

    settings.customServerOptions = customLines.join("\n");

    const before = beforeLines.join("\n");
    const after = afterLines.join("\n");

    return { before, after, settings };
};

const buildServerBlock = (settings: ServerSettings) => {
    const indent = "    ";
    const lines: string[] = ["server:"];

    if (settings.verbosity) {
        lines.push(`${indent}verbosity: ${settings.verbosity}`);
    }

    if (settings.port) {
        lines.push(`${indent}port: ${settings.port}`);
    }

    if (settings.interfaces.length > 0) {
        for (const iface of settings.interfaces) {
            if (iface.trim()) {
                lines.push(`${indent}interface: ${iface.trim()}`);
            }
        }
    }

    lines.push(`${indent}do-ip4: ${toYesNo(settings.doIPv4)}`);
    lines.push(`${indent}do-ip6: ${toYesNo(settings.doIPv6)}`);
    lines.push(`${indent}do-udp: ${toYesNo(settings.doUDP)}`);
    lines.push(`${indent}do-tcp: ${toYesNo(settings.doTCP)}`);
    lines.push(`${indent}hide-identity: ${toYesNo(settings.hideIdentity)}`);
    lines.push(`${indent}hide-version: ${toYesNo(settings.hideVersion)}`);
    lines.push(`${indent}qname-minimisation: ${toYesNo(settings.qnameMinimisation)}`);
    lines.push(`${indent}harden-dnssec-stripped: ${toYesNo(settings.hardenDNSSECStripped)}`);

    if (settings.accessControls.length > 0) {
        for (const rule of settings.accessControls) {
            if (rule.trim()) {
                lines.push(`${indent}access-control: ${rule.trim()}`);
            }
        }
    }

    const customLines = settings.customServerOptions.split(/\r?\n/);
    if (customLines.some(line => line.trim() !== "")) {
        lines.push("");
        for (const custom of customLines) {
            if (!custom) {
                lines.push("");
            } else {
                lines.push(`${indent}${custom.trimStart()}`);
            }
        }
    }

    return lines.join("\n");
};

const mergeConfig = (before: string, serverBlock: string, after: string) => {
    let result = "";

    if (before) {
        result += before.endsWith("\n") ? before : `${before}\n`;
    }

    result += serverBlock.endsWith("\n") ? serverBlock : `${serverBlock}\n`;

    if (after) {
        if (!result.endsWith("\n")) {
            result += "\n";
        }
        result += after;
        if (!result.endsWith("\n")) {
            result += "\n";
        }
    } else if (!result.endsWith("\n")) {
        result += "\n";
    }

    return result;
};

const cleanList = (values: string[]) => values.filter(value => value.trim() !== "");

export const Application = () => {
    const fileRef = useRef<ReturnType<typeof cockpit.file> | null>(null);

    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [saveSuccess, setSaveSuccess] = useState(false);
    const [saving, setSaving] = useState(false);

    const [initialSettings, setInitialSettings] = useState<ServerSettings>(defaultSettings);
    const [settings, setSettings] = useState<ServerSettings>(defaultSettings);
    const [before, setBefore] = useState("");
    const [after, setAfter] = useState("");

    useEffect(() => {
        const file = cockpit.file(CONFIG_PATH, { superuser: "try" });
        fileRef.current = file;

        file.read().then((content: string) => {
            const parsed = parseConfig(content);
            setBefore(parsed.before);
            setAfter(parsed.after);
            setInitialSettings(cloneSettings(parsed.settings));
            setSettings(cloneSettings(parsed.settings));
            setLoadError(null);
        }).catch((error: { message?: string }) => {
            setLoadError(error?.message ?? _("Failed to read the Unbound configuration."));
            setBefore("");
            setAfter("");
            setInitialSettings(cloneSettings(defaultSettings));
            setSettings(cloneSettings(defaultSettings));
        }).finally(() => {
            setLoading(false);
        });

        return () => {
            fileRef.current?.close();
            fileRef.current = null;
        };
    }, []);

    const markEdited = () => {
        setSaveSuccess(false);
        setSaveError(null);
    };

    const validationErrors = useMemo(() => {
        const errors: string[] = [];

        const portNumber = Number(settings.port);
        if (settings.port && (!Number.isInteger(portNumber) || portNumber < 1 || portNumber > 65535)) {
            errors.push(_("The DNS port must be a number between 1 and 65535."));
        }

        const verbosityNumber = Number(settings.verbosity);
        if (settings.verbosity && (!Number.isInteger(verbosityNumber) || verbosityNumber < 0 || verbosityNumber > 5)) {
            errors.push(_("Verbosity must be a number between 0 and 5."));
        }

        const invalidAccessRule = settings.accessControls.find(rule => rule.trim() && rule.split(/\s+/).length < 2);
        if (invalidAccessRule) {
            errors.push(_("Access control rules must contain a network followed by an action (for example: 192.168.1.0/24 allow)."));
        }

        return errors;
    }, [settings]);

    const isDirty = useMemo(() => JSON.stringify(settings) !== JSON.stringify(initialSettings), [settings, initialSettings]);

    const handleListChange = (listKey: "interfaces" | "accessControls", index: number, value: string) => {
        markEdited();
        setSettings(prev => {
            const next = { ...prev };
            const list = listKey === "interfaces" ? [...prev.interfaces] : [...prev.accessControls];
            list[index] = value;
            if (listKey === "interfaces") {
                next.interfaces = list;
            } else {
                next.accessControls = list;
            }
            return next;
        });
    };

    const handleListRemove = (listKey: "interfaces" | "accessControls", index: number) => {
        markEdited();
        setSettings(prev => {
            const next = { ...prev };
            const list = listKey === "interfaces" ? [...prev.interfaces] : [...prev.accessControls];
            list.splice(index, 1);
            if (listKey === "interfaces") {
                next.interfaces = list;
            } else {
                next.accessControls = list;
            }
            return next;
        });
    };

    const handleListAdd = (listKey: "interfaces" | "accessControls") => {
        markEdited();
        setSettings(prev => {
            const next = { ...prev };
            const list = listKey === "interfaces" ? [...prev.interfaces] : [...prev.accessControls];
            list.push("");
            if (listKey === "interfaces") {
                next.interfaces = list;
            } else {
                next.accessControls = list;
            }
            return next;
        });
    };

    const handleBooleanChange = (key: keyof ServerSettings) => (_event: React.FormEvent<HTMLInputElement>, checked: boolean) => {
        markEdited();
        setSettings(prev => ({ ...prev, [key]: checked }));
    };

    const handleSave = () => {
        if (!fileRef.current || validationErrors.length > 0) {
            return;
        }

        setSaving(true);
        setSaveError(null);
        setSaveSuccess(false);

        const cleanSettings: ServerSettings = {
            ...settings,
            interfaces: cleanList(settings.interfaces),
            accessControls: cleanList(settings.accessControls),
            customServerOptions: settings.customServerOptions
        };

        const serverBlock = buildServerBlock(cleanSettings);
        const mergedConfig = mergeConfig(before, serverBlock, after);

        fileRef.current.replace(mergedConfig).then(() => {
            const cloned = cloneSettings(cleanSettings);
            setInitialSettings(cloned);
            setSettings(cloneSettings(cloned));
            setSaveSuccess(true);
        }).catch((error: { message?: string }) => {
            setSaveError(error?.message ?? _("Failed to save configuration."));
        }).finally(() => {
            setSaving(false);
        });
    };

    const handleReset = () => {
        setSettings(cloneSettings(initialSettings));
        setSaveError(null);
        setSaveSuccess(false);
    };

    return (
        <Page className="unbound-app">
            <PageSection variant={ PageSectionVariants.light }>
                <Title headingLevel="h1" size="2xl">{ _("Unbound DNS" ) }</Title>
                <p className="unbound-app__intro">
                    { _("Configure the Unbound recursive DNS resolver without leaving Cockpit. Update network interfaces, hardening options, and access policies using the form below.") }
                </p>
            </PageSection>

            <PageSection>
                { loading && (
                    <Card isFlat>
                        <CardBody className="unbound-app__loading">
                            <Spinner size="lg" />
                            <span>{ _("Loading configuration…") }</span>
                        </CardBody>
                    </Card>
                ) }

                { !loading && loadError && (
                    <Alert isInline variant="warning" title={ _("Unable to load configuration") }>
                        { loadError }
                        <br />
                        { _("Editing the form will create a new configuration file when you save.") }
                    </Alert>
                ) }

                { !loading && (
                    <Card isRounded>
                        <CardHeader>
                            <CardTitle>{ _("Server configuration") }</CardTitle>
                        </CardHeader>
                        <CardBody>
                            <Form isWidthLimited>
                                <FormGroup label={ _("Verbosity") } fieldId="unbound-verbosity">
                                    <TextInput
                                        id="unbound-verbosity"
                                        type="number"
                                        min="0"
                                        max="5"
                                        value={ settings.verbosity }
                                        onChange={ (_event, value) => {
                                            markEdited();
                                            setSettings(prev => ({ ...prev, verbosity: value }));
                                        } }
                                    />
                                    <HelperText>
                                        <HelperTextItem>
                                            { _("Controls the amount of logging Unbound performs (0-5). Higher values are more verbose.") }
                                        </HelperTextItem>
                                    </HelperText>
                                </FormGroup>

                                <FormGroup label={ _("Listening port") } fieldId="unbound-port">
                                    <TextInput
                                        id="unbound-port"
                                        type="number"
                                        min="1"
                                        max="65535"
                                        value={ settings.port }
                                        onChange={ (_event, value) => {
                                            markEdited();
                                            setSettings(prev => ({ ...prev, port: value }));
                                        } }
                                    />
                                    <HelperText>
                                        <HelperTextItem>
                                            { _("The default DNS port is 53. Change this only when the service must listen on an alternate port.") }
                                        </HelperTextItem>
                                    </HelperText>
                                </FormGroup>

                                <FormGroup label={ _("Listen interfaces") } fieldId="unbound-interfaces">
                                    <div className="unbound-list-editor">
                                        { settings.interfaces.length === 0 && (
                                            <p className="pf-v5-u-color-200">
                                                { _("No interfaces specified. Unbound listens on localhost by default.") }
                                            </p>
                                        ) }
                                        { settings.interfaces.map((iface, index) => (
                                            <Flex key={`interface-${index}`} alignItems={{ default: "alignItemsCenter" }} className="unbound-list-editor__row">
                                                <FlexItem grow={{ default: "grow" }}>
                                                    <TextInput
                                                        id={`unbound-interface-${index}`}
                                                        value={ iface }
                                                        placeholder="0.0.0.0"
                                                        onChange={ (_event, value) => handleListChange("interfaces", index, value) }
                                                    />
                                                </FlexItem>
                                                <FlexItem>
                                                    <Button
                                                        variant="plain"
                                                        icon={ <MinusCircleIcon /> }
                                                        aria-label={ _("Remove interface") }
                                                        onClick={ () => handleListRemove("interfaces", index) }
                                                    />
                                                </FlexItem>
                                            </Flex>
                                        )) }
                                        <Button
                                            variant="link"
                                            icon={ <PlusCircleIcon /> }
                                            onClick={ () => handleListAdd("interfaces") }
                                        >
                                            { _("Add interface") }
                                        </Button>
                                    </div>
                                </FormGroup>

                                <FormGroup label={ _("Access control") } fieldId="unbound-access">
                                    <div className="unbound-list-editor">
                                        { settings.accessControls.length === 0 && (
                                            <p className="pf-v5-u-color-200">
                                                { _("No networks defined. Only local queries will be permitted.") }
                                            </p>
                                        ) }
                                        { settings.accessControls.map((rule, index) => (
                                            <Flex key={`access-${index}`} alignItems={{ default: "alignItemsCenter" }} className="unbound-list-editor__row">
                                                <FlexItem grow={{ default: "grow" }}>
                                                    <TextInput
                                                        id={`unbound-access-${index}`}
                                                        value={ rule }
                                                        placeholder="192.168.1.0/24 allow"
                                                        onChange={ (_event, value) => handleListChange("accessControls", index, value) }
                                                    />
                                                </FlexItem>
                                                <FlexItem>
                                                    <Button
                                                        variant="plain"
                                                        icon={ <MinusCircleIcon /> }
                                                        aria-label={ _("Remove rule") }
                                                        onClick={ () => handleListRemove("accessControls", index) }
                                                    />
                                                </FlexItem>
                                            </Flex>
                                        )) }
                                        <Button
                                            variant="link"
                                            icon={ <PlusCircleIcon /> }
                                            onClick={ () => handleListAdd("accessControls") }
                                        >
                                            { _("Add rule") }
                                        </Button>
                                    </div>
                                    <HelperText>
                                        <HelperTextItem>
                                            { _("Each rule should include a CIDR network and an action (allow, deny, refuse, allow_snoop).") }
                                        </HelperTextItem>
                                    </HelperText>
                                </FormGroup>

                                <FormGroup label={ _("Network protocols") } fieldId="unbound-protocols">
                                    <div className="unbound-switch-grid">
                                        <Switch
                                            id="unbound-ipv4"
                                            label={ _("IPv4 enabled") }
                                            labelOff={ _("IPv4 disabled") }
                                            isChecked={ settings.doIPv4 }
                                            onChange={ handleBooleanChange("doIPv4") }
                                        />
                                        <Switch
                                            id="unbound-ipv6"
                                            label={ _("IPv6 enabled") }
                                            labelOff={ _("IPv6 disabled") }
                                            isChecked={ settings.doIPv6 }
                                            onChange={ handleBooleanChange("doIPv6") }
                                        />
                                        <Switch
                                            id="unbound-udp"
                                            label={ _("UDP enabled") }
                                            labelOff={ _("UDP disabled") }
                                            isChecked={ settings.doUDP }
                                            onChange={ handleBooleanChange("doUDP") }
                                        />
                                        <Switch
                                            id="unbound-tcp"
                                            label={ _("TCP enabled") }
                                            labelOff={ _("TCP disabled") }
                                            isChecked={ settings.doTCP }
                                            onChange={ handleBooleanChange("doTCP") }
                                        />
                                    </div>
                                </FormGroup>

                                <FormGroup label={ _("Hardening") } fieldId="unbound-hardening">
                                    <div className="unbound-switch-grid">
                                        <Switch
                                            id="unbound-hide-identity"
                                            label={ _("Hide identity") }
                                            labelOff={ _("Expose identity") }
                                            isChecked={ settings.hideIdentity }
                                            onChange={ handleBooleanChange("hideIdentity") }
                                        />
                                        <Switch
                                            id="unbound-hide-version"
                                            label={ _("Hide version") }
                                            labelOff={ _("Expose version") }
                                            isChecked={ settings.hideVersion }
                                            onChange={ handleBooleanChange("hideVersion") }
                                        />
                                        <Switch
                                            id="unbound-qname"
                                            label={ _("QNAME minimisation") }
                                            labelOff={ _("QNAME minimisation disabled") }
                                            isChecked={ settings.qnameMinimisation }
                                            onChange={ handleBooleanChange("qnameMinimisation") }
                                        />
                                        <Switch
                                            id="unbound-harden"
                                            label={ _("Harden DNSSEC stripped") }
                                            labelOff={ _("Do not harden DNSSEC stripped") }
                                            isChecked={ settings.hardenDNSSECStripped }
                                            onChange={ handleBooleanChange("hardenDNSSECStripped") }
                                        />
                                    </div>
                                </FormGroup>

                                <FormGroup label={ _("Additional server options") } fieldId="unbound-custom">
                                    <TextArea
                                        id="unbound-custom"
                                        resizeOrientation="vertical"
                                        value={ settings.customServerOptions }
                                        onChange={ (_event, value) => {
                                            markEdited();
                                            setSettings(prev => ({ ...prev, customServerOptions: value }));
                                        } }
                                        rows={ 6 }
                                        placeholder={ _("Add any additional server directives, one per line.") }
                                    />
                                    <HelperText>
                                        <HelperTextItem>
                                            { _("These lines will be added verbatim to the server section for advanced configuration.") }
                                        </HelperTextItem>
                                    </HelperText>
                                </FormGroup>
                            </Form>

                            { validationErrors.length > 0 && (
                                <Alert isInline variant="danger" title={ _("Configuration issues") }>
                                    <ul>
                                        { validationErrors.map((error, index) => <li key={ index }>{ error }</li>) }
                                    </ul>
                                </Alert>
                            ) }

                            { saveError && (
                                <Alert isInline variant="danger" title={ _("Failed to save configuration") }>
                                    { saveError }
                                </Alert>
                            ) }

                            { saveSuccess && !saveError && (
                                <Alert isInline variant="success" title={ _("Configuration saved") }>
                                    { _("The Unbound configuration file has been updated.") }
                                </Alert>
                            ) }
                        </CardBody>
                        <CardFooter>
                            <Flex spaceItems={{ default: "spaceItemsMd" }}>
                                <FlexItem>
                                    <Button
                                        variant="primary"
                                        onClick={ handleSave }
                                        isDisabled={ !isDirty || validationErrors.length > 0 || saving }
                                        isLoading={ saving }
                                    >
                                        { _("Save changes") }
                                    </Button>
                                </FlexItem>
                                <FlexItem>
                                    <Button
                                        variant="secondary"
                                        onClick={ handleReset }
                                        isDisabled={ !isDirty || saving }
                                    >
                                        { _("Reset") }
                                    </Button>
                                </FlexItem>
                            </Flex>
                        </CardFooter>
                    </Card>
                ) }
            </PageSection>
        </Page>
    );
};
